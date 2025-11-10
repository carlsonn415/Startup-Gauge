import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { prisma } from "@/lib/db/prisma";
import { stripe } from "@/lib/stripe/client";
import { getPlanByPriceId, PLANS } from "@/lib/stripe/plans";
import { successResponse, errorResponse, handleApiError } from "@/lib/api/errors";

/**
 * Manually sync subscription from Stripe to database
 * This is a fallback when webhooks fail or aren't configured
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    
    if (!payload || !payload.email) {
      return errorResponse("Unauthorized", 401, "UNAUTHORIZED");
    }

    const userEmail = payload.email as string;
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    
    if (!user) {
      return errorResponse("User not found", 404, "USER_NOT_FOUND");
    }

    console.log(`[Sync] Looking up subscription for user: ${user.id} (${userEmail})`);

    // Check if subscription already exists in database
    const existingSubscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    // FIRST: Check for recent upgrade payments that might not have been processed by webhook
    // This handles the case where webhooks aren't configured or failed
    // This MUST run before regular sync to process upgrades
    if (existingSubscription?.stripeCustomerId) {
      console.log(`[Sync] Checking for recent upgrade payments...`);
      
      try {
        // Get recent checkout sessions for this customer
        const checkoutSessions = await stripe.checkout.sessions.list({
          customer: existingSubscription.stripeCustomerId,
          limit: 10,
        });

        // Find the most recent successful upgrade payment (within last hour)
        const upgradeSession = checkoutSessions.data.find(
          (session) => 
            session.mode === "payment" &&
            session.payment_status === "paid" &&
            session.metadata?.upgrade === "true" &&
            session.metadata?.upgradeType === "starter-to-pro" &&
            session.created > (Date.now() / 1000 - 3600) // Within last hour
        );

        if (upgradeSession) {
          console.log(`[Sync] Found recent upgrade payment: ${upgradeSession.id}`);
          console.log(`[Sync] Processing upgrade manually (webhook may not have fired)...`);
          
          // Process the upgrade manually (same logic as webhook handler)
          const proPlan = PLANS.pro;
          if (proPlan.stripePriceId && existingSubscription.stripeSubscriptionId) {
            try {
              // Update subscription to Pro plan
              const currentSubscription = await stripe.subscriptions.retrieve(
                existingSubscription.stripeSubscriptionId
              );
              
              // Only update if not already on Pro
              if (currentSubscription.items.data[0]?.price.id !== proPlan.stripePriceId) {
                console.log(`[Sync] Updating subscription to Pro plan...`);
                const updatedSubscription = await stripe.subscriptions.update(
                  existingSubscription.stripeSubscriptionId,
                  {
                    items: [{
                      id: currentSubscription.items.data[0].id,
                      price: proPlan.stripePriceId,
                    }],
                    proration_behavior: "none",
                  }
                );

                // Update database
                await prisma.subscription.update({
                  where: { userId: user.id },
                  data: {
                    stripePriceId: proPlan.stripePriceId,
                    status: updatedSubscription.status,
                    currentPeriodEnd: new Date(updatedSubscription.current_period_end * 1000),
                    cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end || false,
                  },
                });

                // Add 75 bonus credits
                const period = new Date().toISOString().slice(0, 7);
                const usageMeter = await prisma.usageMeter.findUnique({
                  where: { userId_period: { userId: user.id, period } },
                });

                if (usageMeter) {
                  await prisma.usageMeter.update({
                    where: { id: usageMeter.id },
                    data: {
                      included: usageMeter.included + 75,
                    },
                  });
                  console.log(`[Sync] Added 75 credits. New limit: ${usageMeter.included + 75}`);
                } else {
                  await prisma.usageMeter.create({
                    data: {
                      userId: user.id,
                      period,
                      included: proPlan.includedAnalyses + 75,
                      consumed: 0,
                    },
                  });
                  console.log(`[Sync] Created usage meter with ${proPlan.includedAnalyses + 75} credits`);
                }

                console.log(`[Sync] Successfully processed upgrade to Pro plan`);
                
                return successResponse({
                  message: "Upgrade processed successfully",
                  subscription: {
                    status: updatedSubscription.status,
                    plan: "pro",
                  },
                });
              } else {
                console.log(`[Sync] Subscription already on Pro plan`);
              }
            } catch (err) {
              console.error(`[Sync] Error processing upgrade:`, err);
              // Continue to regular sync if upgrade fails
            }
          }
        } else {
          console.log(`[Sync] No recent upgrade payments found`);
        }
      } catch (err) {
        console.error(`[Sync] Error checking for upgrade payments:`, err);
        // Continue to regular sync if check fails
      }
    }

    // SECOND: If subscription exists in DB, verify it's still active in Stripe and sync
    if (existingSubscription?.stripeSubscriptionId) {
      console.log(`[Sync] Found existing subscription in DB: ${existingSubscription.stripeSubscriptionId}`);
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          existingSubscription.stripeSubscriptionId
        );
        
        const priceId = stripeSubscription.items.data[0]?.price.id;
        const plan = getPlanByPriceId(priceId);

        // Update subscription in database
        await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: {
            stripePriceId: priceId,
            status: stripeSubscription.status,
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
            cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          },
        });

        // Update usage meter (only if not already updated by upgrade processing)
        if (plan) {
          const period = new Date().toISOString().slice(0, 7);
          await prisma.usageMeter.upsert({
            where: { userId_period: { userId: user.id, period } },
            update: { included: plan.includedAnalyses },
            create: { 
              userId: user.id, 
              period, 
              included: plan.includedAnalyses, 
              consumed: 0,
            },
          });
        }

        return successResponse({
          message: "Subscription synced",
          subscription: {
            status: stripeSubscription.status,
            plan: plan?.name || "unknown",
          },
        });
      } catch (err: any) {
        console.error(`[Sync] Error retrieving subscription from Stripe:`, err);
        // Subscription might have been deleted in Stripe, continue to search
      }
    }

    // No subscription in DB or it was deleted - search Stripe for active subscriptions
    console.log(`[Sync] Searching Stripe for subscriptions for customer...`);

    // First, try to find customer by email
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 10,
    });

    if (customers.data.length === 0) {
      console.log(`[Sync] No Stripe customer found for email: ${userEmail}`);
      return successResponse({
        message: "No subscription found",
        subscription: null,
      });
    }

    // Check each customer for active subscriptions
    for (const customer of customers.data) {
      console.log(`[Sync] Checking customer: ${customer.id}`);
      
      // Get all subscriptions for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 10,
      });

      // Find the most recent active or trialing subscription
      const activeSubscription = subscriptions.data.find(
        (sub) => sub.status === "active" || sub.status === "trialing"
      );

      if (activeSubscription) {
        console.log(`[Sync] Found active subscription: ${activeSubscription.id}`);
        
        const priceId = activeSubscription.items.data[0]?.price.id;
        const plan = getPlanByPriceId(priceId);

        // Create or update subscription in database
        await prisma.subscription.upsert({
          where: { userId: user.id },
          update: {
            stripeCustomerId: customer.id,
            stripeSubscriptionId: activeSubscription.id,
            stripePriceId: priceId,
            status: activeSubscription.status,
            currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000),
            cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
          },
          create: {
            userId: user.id,
            stripeCustomerId: customer.id,
            stripeSubscriptionId: activeSubscription.id,
            stripePriceId: priceId,
            status: activeSubscription.status,
            currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000),
            cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
          },
        });

        // Update usage meter
        if (plan) {
          const period = new Date().toISOString().slice(0, 7);
          await prisma.usageMeter.upsert({
            where: { userId_period: { userId: user.id, period } },
            update: { included: plan.includedAnalyses },
            create: { 
              userId: user.id, 
              period, 
              included: plan.includedAnalyses, 
              consumed: 0,
            },
          });
        }

        console.log(`[Sync] Successfully created subscription in DB: ${activeSubscription.id}`);
        
        return successResponse({
          message: "Subscription created from Stripe",
          subscription: {
            status: activeSubscription.status,
            plan: plan?.name || "unknown",
          },
        });
      }
    }

    console.log(`[Sync] No active subscription found in Stripe`);
    return successResponse({
      message: "No active subscription found",
      subscription: null,
    });
  } catch (err: unknown) {
    console.error("[Sync] Error syncing subscription:", err);
    return handleApiError(err);
  }
}


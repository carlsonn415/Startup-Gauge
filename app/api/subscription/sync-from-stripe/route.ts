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


    // Check if subscription already exists in database
    const existingSubscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    // FIRST: Check for recent upgrade payments that might not have been processed by webhook
    // This handles the case where webhooks aren't configured or failed
    // This MUST run before regular sync to process upgrades
    if (existingSubscription?.stripeCustomerId) {
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
          // Check if subscription is already on Pro plan (upgrade may have already been processed)
          if (existingSubscription.stripePriceId === PLANS.pro.stripePriceId) {
            // Continue to regular sync
          } else {
            // Process the upgrade manually (same logic as webhook handler)
            const proPlan = PLANS.pro;
            const currentSubscriptionId = upgradeSession.metadata?.currentSubscriptionId;
            
            if (proPlan.stripePriceId && currentSubscriptionId) {
              try {
                const customerId = existingSubscription.stripeCustomerId;
                
                // Check if old subscription still exists before trying to retrieve it
                let oldSubscription;
                try {
                  oldSubscription = await stripe.subscriptions.retrieve(currentSubscriptionId);
                } catch (err: any) {
                  // If subscription doesn't exist, it may have already been canceled
                  // Check if we already have a new Pro subscription
                  if (existingSubscription.stripeSubscriptionId !== currentSubscriptionId) {
                    // Upgrade already processed, continue to regular sync
                    return successResponse({
                      message: "Upgrade already processed",
                      subscription: {
                        status: existingSubscription.status,
                        plan: "pro",
                      },
                    });
                  }
                  throw err; // Re-throw if it's a different error
                }
                
                // Only process if not already on Pro
                if (oldSubscription.items.data[0]?.price.id !== proPlan.stripePriceId) {
                  // Calculate remaining days in current subscription period
                  const now = Math.floor(Date.now() / 1000);
                  const periodEnd = oldSubscription.current_period_end;
                  
                  // Cancel the old subscription immediately
                  await stripe.subscriptions.cancel(currentSubscriptionId);

                  // Create a new Pro subscription with trial period equal to remaining days in old subscription
                  // Since user already paid the upgrade cost, they shouldn't be charged until their old period would have ended
                  const trialEnd = periodEnd; // Use the old subscription's period end as the trial end
                  
                  const newSubscription = await stripe.subscriptions.create({
                    customer: customerId,
                    items: [{ price: proPlan.stripePriceId }],
                    trial_end: trialEnd,
                    metadata: {
                      userId: user.id,
                      upgradeFrom: "starter",
                      oldSubscriptionId: currentSubscriptionId,
                    },
                  });

                  // Update database with new subscription
                  await prisma.subscription.update({
                    where: { userId: user.id },
                    data: {
                      stripeSubscriptionId: newSubscription.id,
                      stripePriceId: proPlan.stripePriceId,
                      status: newSubscription.status,
                      currentPeriodEnd: new Date(newSubscription.current_period_end * 1000),
                      cancelAtPeriodEnd: false,
                    },
                  });

                  // Set usage meter to Pro plan limit (50)
                  const period = new Date().toISOString().slice(0, 7);
                  await prisma.usageMeter.upsert({
                    where: { userId_period: { userId: user.id, period } },
                    update: {
                      included: proPlan.includedAnalyses,
                    },
                    create: {
                      userId: user.id,
                      period,
                      included: proPlan.includedAnalyses,
                      consumed: 0,
                    },
                  });
                  
                  return successResponse({
                    message: "Upgrade processed successfully",
                    subscription: {
                      status: newSubscription.status,
                      plan: "pro",
                    },
                  });
                }
              } catch (err) {
                console.error(`[Sync] Error processing upgrade:`, err);
                // Continue to regular sync if upgrade fails
              }
            }
          }
        }
      } catch (err) {
        console.error(`[Sync] Error checking for upgrade payments:`, err);
        // Continue to regular sync if check fails
      }
    }

    // SECOND: If subscription exists in DB, verify it's still active in Stripe and sync
    // Refresh subscription from DB in case it was updated by upgrade processing
    const currentSubscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    
    if (currentSubscription?.stripeSubscriptionId) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          currentSubscription.stripeSubscriptionId
        );
        
        const priceId = stripeSubscription.items.data[0]?.price.id;
        const plan = getPlanByPriceId(priceId);

        // Update subscription in database
        await prisma.subscription.update({
          where: { id: currentSubscription.id },
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
    // First, try to find customer by email
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 10,
    });

    if (customers.data.length === 0) {
      return successResponse({
        message: "No subscription found",
        subscription: null,
      });
    }

    // Check each customer for active subscriptions
    for (const customer of customers.data) {
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

        return successResponse({
          message: "Subscription created from Stripe",
          subscription: {
            status: activeSubscription.status,
            plan: plan?.name || "unknown",
          },
        });
      }
    }

    return successResponse({
      message: "No active subscription found",
      subscription: null,
    });
  } catch (err: unknown) {
    console.error("[Sync] Error syncing subscription:", err);
    return handleApiError(err);
  }
}


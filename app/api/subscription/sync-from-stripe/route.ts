import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { prisma } from "@/lib/db/prisma";
import { stripe } from "@/lib/stripe/client";
import { getPlanByPriceId } from "@/lib/stripe/plans";
import { successResponse, errorResponse, handleApiError } from "@/lib/api/errors";

/**
 * Manually sync subscription from Stripe to database
 * This is a fallback when webhooks fail or aren't configured
 */
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

    // If subscription exists in DB, verify it's still active in Stripe
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

        // Update usage meter
        if (plan) {
          const period = new Date().toISOString().slice(0, 7);
          await prisma.usageMeter.upsert({
            where: { userId_period: { userId: user.id, period } },
            update: { included: plan.includedAnalyses },
            create: { userId: user.id, period, included: plan.includedAnalyses, consumed: 0 },
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
            create: { userId: user.id, period, included: plan.includedAnalyses, consumed: 0 },
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


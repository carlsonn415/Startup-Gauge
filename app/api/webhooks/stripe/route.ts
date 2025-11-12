import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db/prisma";
import { getPlanByPriceId, PLANS } from "@/lib/stripe/plans";
import Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    console.log(`[Webhook] Received event: ${event.type}`);
    
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Handle one-time payments (like upgrades)
        if (session.mode === "payment" && session.metadata?.upgrade === "true") {
          await handleUpgradePayment(session);
        } else if (session.mode === "subscription") {
          // Handle subscription checkout
          await handleCheckoutCompleted(session);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Webhook] Subscription ${event.type}: ${subscription.id}`);
        await handleSubscriptionChange(subscription);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Webhook] Invoice payment succeeded: ${invoice.id}`);
        await handleInvoicePayment(invoice);
        break;
      }
      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleUpgradePayment(session: Stripe.Checkout.Session) {
  let userId = session.metadata?.userId;
    if (!userId) {
      // Try to get userId from customer metadata as fallback
      if (session.customer) {
        try {
          const customer = await stripe.customers.retrieve(session.customer as string);
          if (customer && !customer.deleted && customer.metadata?.userId) {
            userId = customer.metadata.userId;
          }
        } catch (err) {
          console.error("[Webhook] Error retrieving customer:", err);
        }
      }
      
      if (!userId) {
        console.error("[Webhook] Cannot proceed without userId");
        return;
      }
    }

  const upgradeType = session.metadata?.upgradeType;
  const currentSubscriptionId = session.metadata?.currentSubscriptionId;
  const targetPlanId = session.metadata?.planId;

  if (upgradeType === "starter-to-pro" && currentSubscriptionId && targetPlanId === "pro") {
    try {
      // Verify payment was successful
      if (session.payment_status !== "paid") {
        console.error(`[Webhook] Payment not completed. Status: ${session.payment_status}`);
        return;
      }

      const proPlan = PLANS.pro;
      if (!proPlan.stripePriceId) {
        throw new Error("Pro plan price ID not configured");
      }

      const customerId = session.customer as string;
      
      // Get the current subscription to calculate remaining days
      const currentSubscription = await stripe.subscriptions.retrieve(currentSubscriptionId);
      
      // Calculate remaining days in current subscription period
      const now = Math.floor(Date.now() / 1000);
      const periodEnd = currentSubscription.current_period_end;
      const remainingSeconds = Math.max(0, periodEnd - now);
      const remainingDays = Math.ceil(remainingSeconds / (24 * 60 * 60));
      
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
          userId,
          upgradeFrom: "starter",
          oldSubscriptionId: currentSubscriptionId,
        },
      });

      // Update database with new subscription
      await prisma.subscription.update({
        where: { userId },
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
        where: { userId_period: { userId, period } },
        update: {
          included: proPlan.includedAnalyses,
        },
        create: {
          userId,
          period,
          included: proPlan.includedAnalyses,
          consumed: 0,
        },
      });
    } catch (err) {
      console.error("[Webhook] Error processing upgrade payment:", err);
      if (err instanceof Error) {
        console.error("[Webhook] Error message:", err.message);
        console.error("[Webhook] Error stack:", err.stack);
      }
      throw err;
    }
  } else {
    console.error("[Webhook] Invalid upgrade parameters:", {
      upgradeType,
      currentSubscriptionId,
      targetPlanId,
    });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log("[Webhook] Handling checkout completed:", session.id);
  console.log("[Webhook] Session metadata:", JSON.stringify(session.metadata, null, 2));
  
  let userId = session.metadata?.userId;
  
  // Fallback: try to get userId from customer metadata
  if (!userId && session.customer) {
    console.log("[Webhook] No userId in session metadata, checking customer metadata...");
    try {
      const customer = await stripe.customers.retrieve(session.customer as string);
      if (customer && !customer.deleted && customer.metadata?.userId) {
        userId = customer.metadata.userId;
        console.log("[Webhook] Found userId in customer metadata:", userId);
      }
    } catch (err) {
      console.error("[Webhook] Error retrieving customer:", err);
    }
  }

  if (!userId) {
    console.error("[Webhook] No userId found in session or customer metadata. Cannot create subscription.");
    console.error("[Webhook] Session customer:", session.customer);
    console.error("[Webhook] Session subscription:", session.subscription);
    return;
  }

  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  if (!subscriptionId) {
    console.error("[Webhook] No subscription ID in checkout session");
    return;
  }

  console.log("[Webhook] Creating subscription for user:", userId, "subscription:", subscriptionId);

  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = stripeSubscription.items.data[0]?.price.id;
    const plan = getPlanByPriceId(priceId);

    console.log("[Webhook] Plan found:", plan?.name, "Price ID:", priceId, "Status:", stripeSubscription.status);

    // If this is an upgrade, cancel the old subscription
    const isUpgrade = session.metadata?.upgrade === "true";
    const oldSubscriptionId = session.metadata?.currentSubscriptionId;
    
    if (isUpgrade && oldSubscriptionId) {
      console.log(`[Webhook] This is an upgrade. Canceling old subscription: ${oldSubscriptionId}`);
      try {
        await stripe.subscriptions.cancel(oldSubscriptionId);
        console.log(`[Webhook] Old subscription ${oldSubscriptionId} canceled successfully`);
      } catch (err) {
        console.error(`[Webhook] Error canceling old subscription:`, err);
        // Continue anyway - the new subscription is active
      }
    }

    // If this is a reactivation, cancel the old subscription
    const isReactivation = session.metadata?.reactivate === "true";
    const oldSubId = session.metadata?.oldSubscriptionId;
    
    if (isReactivation && oldSubId) {
      console.log(`[Webhook] This is a reactivation. Canceling old subscription: ${oldSubId}`);
      try {
        await stripe.subscriptions.cancel(oldSubId);
        console.log(`[Webhook] Old subscription ${oldSubId} canceled successfully`);
      } catch (err) {
        console.error(`[Webhook] Error canceling old subscription:`, err);
        // Continue anyway - the new subscription is active
      }
    }

    await prisma.subscription.upsert({
      where: { userId },
      update: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        status: stripeSubscription.status,
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
      create: {
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        status: stripeSubscription.status,
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
    });

    console.log("[Webhook] Subscription upserted successfully");

    // Update usage meter for current period
    if (plan) {
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM
      const existingMeter = await prisma.usageMeter.findUnique({
        where: { userId_period: { userId, period } },
      });

      // Set usage meter to plan's included analyses (don't add to existing)
      await prisma.usageMeter.upsert({
        where: { userId_period: { userId, period } },
        update: {
          included: plan.includedAnalyses, // Set to plan limit, not add to existing
        },
        create: {
          userId,
          period,
          included: plan.includedAnalyses,
          consumed: 0,
        },
      });
      console.log(`[Webhook] Usage meter set to ${plan.includedAnalyses} for ${plan.name} plan`);
    }
  } catch (err) {
    console.error("[Webhook] Error creating subscription:", err);
    throw err;
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const sub = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
  });
  if (!sub) return;

  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanByPriceId(priceId);
  
  console.log("Subscription changed:", {
    oldPrice: sub.stripePriceId,
    newPrice: priceId,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: subscription.cancel_at,
    subscriptionId: subscription.id,
  });

  // Check if this is an upgrade to Pro (from Starter or from any canceled subscription)
  const isUpgradeToPro = priceId === PLANS.pro.stripePriceId && sub.stripePriceId === PLANS.starter.stripePriceId;
  const isProPlan = priceId === PLANS.pro.stripePriceId;
  
  // Update database
  // For Pro plan subscriptions, always set cancelAtPeriodEnd to false (upgrades should never be canceled)
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      stripePriceId: priceId,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: isProPlan ? false : subscription.cancel_at_period_end,
    },
  });
  
  // If this is Pro plan and Stripe still has cancellation flag, remove it
  if (isProPlan && subscription.cancel_at_period_end) {
    try {
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
        cancel_at: null,
      });
      // Update database again to ensure it's false
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: false },
      });
    } catch (err) {
      console.error(`[Webhook] Error removing cancellation flag:`, err);
    }
  }

  // Update usage meter if plan changed - set to plan's limit
  if (plan && priceId !== sub.stripePriceId) {
    const period = new Date().toISOString().slice(0, 7);
    await prisma.usageMeter.upsert({
      where: { userId_period: { userId: sub.userId, period } },
      update: {
        included: plan.includedAnalyses, // Set to plan limit
      },
      create: {
        userId: sub.userId,
        period,
        included: plan.includedAnalyses,
        consumed: 0,
      },
    });
  }
}

async function handleInvoicePayment(invoice: Stripe.Invoice) {
  // Optionally reset usage meter on successful payment (new billing period)
  const customerId = invoice.customer as string;
  const sub = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    include: { user: true },
  });
  if (!sub) return;

  const priceId = sub.stripePriceId;
  const plan = getPlanByPriceId(priceId || "");
  if (!plan) return;

  const period = new Date().toISOString().slice(0, 7);
  await prisma.usageMeter.upsert({
    where: { userId_period: { userId: sub.userId, period } },
    update: { included: plan.includedAnalyses, consumed: 0 },
    create: { 
      userId: sub.userId, 
      period, 
      included: plan.includedAnalyses, 
      consumed: 0,
    },
  });
}


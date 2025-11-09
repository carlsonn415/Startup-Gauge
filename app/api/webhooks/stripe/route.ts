import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db/prisma";
import { getPlanByPriceId, PLANS } from "@/lib/stripe/plans";
import Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

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
        console.log(`[Webhook] Checkout session completed. Mode: ${session.mode}, Payment status: ${session.payment_status}`);
        
        // Handle one-time payments (like upgrades)
        if (session.mode === "payment" && session.metadata?.upgrade === "true") {
          console.log("[Webhook] Detected upgrade payment, calling handleUpgradePayment");
          await handleUpgradePayment(session);
        } else if (session.mode === "subscription") {
          // Handle subscription checkout (existing logic)
          console.log("[Webhook] Detected subscription checkout, calling handleCheckoutCompleted");
          await handleCheckoutCompleted(session);
        } else {
          console.log(`[Webhook] Unhandled checkout session mode: ${session.mode}`);
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
  console.log("[Webhook] Handling upgrade payment:", session.id);
  console.log("[Webhook] Session mode:", session.mode);
  console.log("[Webhook] Session metadata:", JSON.stringify(session.metadata, null, 2));
  console.log("[Webhook] Session payment_status:", session.payment_status);
  
  let userId = session.metadata?.userId;
  if (!userId) {
    console.error("[Webhook] No userId in upgrade session metadata");
    // Try to get userId from customer metadata as fallback
    if (session.customer) {
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
      console.error("[Webhook] Cannot proceed without userId");
      return;
    }
  }

  const upgradeType = session.metadata?.upgradeType;
  const currentSubscriptionId = session.metadata?.currentSubscriptionId;
  const additionalCredits = parseInt(session.metadata?.additionalCredits || "0");
  const targetPlanId = session.metadata?.planId;

  console.log("[Webhook] Upgrade details:", {
    upgradeType,
    currentSubscriptionId,
    additionalCredits,
    targetPlanId,
    userId,
  });

  if (upgradeType === "starter-to-pro" && currentSubscriptionId && targetPlanId === "pro") {
    try {
      // Verify payment was successful
      if (session.payment_status !== "paid") {
        console.error(`[Webhook] Payment not completed. Status: ${session.payment_status}`);
        return;
      }

      // Update subscription to Pro plan
      const proPlan = PLANS.pro;
      if (!proPlan.stripePriceId) {
        throw new Error("Pro plan price ID not configured");
      }

      console.log(`[Webhook] Retrieving subscription ${currentSubscriptionId}`);
      const currentSubscription = await stripe.subscriptions.retrieve(currentSubscriptionId);
      console.log(`[Webhook] Current subscription price: ${currentSubscription.items.data[0]?.price.id}`);
      
      console.log(`[Webhook] Updating subscription to Pro plan (${proPlan.stripePriceId})`);
      const updatedSubscription = await stripe.subscriptions.update(currentSubscriptionId, {
        items: [{
          id: currentSubscription.items.data[0].id,
          price: proPlan.stripePriceId,
        }],
        proration_behavior: "none", // No proration since user already paid the difference
      });
      console.log(`[Webhook] Subscription updated successfully. New price: ${updatedSubscription.items.data[0]?.price.id}`);

      // Update local database
      console.log(`[Webhook] Updating database for user ${userId}`);
      const updatedDbSubscription = await prisma.subscription.update({
        where: { userId },
        data: {
          stripePriceId: proPlan.stripePriceId,
          status: updatedSubscription.status,
          currentPeriodEnd: new Date(updatedSubscription.current_period_end * 1000),
          cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end || false,
        },
      });
      console.log(`[Webhook] Database updated. New price ID: ${updatedDbSubscription.stripePriceId}`);

      // Add additional credits to usage meter
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM
      const usageMeter = await prisma.usageMeter.findUnique({
        where: { userId_period: { userId, period } },
      });

      if (usageMeter) {
        // Add credits to the existing limit (increase included)
        const newLimit = usageMeter.included + additionalCredits;
        await prisma.usageMeter.update({
          where: { id: usageMeter.id },
          data: {
            included: newLimit,
          },
        });
        console.log(`[Webhook] Added ${additionalCredits} credits to user ${userId}. New limit: ${newLimit} (was ${usageMeter.included})`);
      } else {
        // Create new usage meter with Pro plan limits + additional credits
        const newLimit = proPlan.includedAnalyses + additionalCredits;
        await prisma.usageMeter.create({
          data: {
            userId,
            period,
            included: newLimit,
            consumed: 0,
          },
        });
        console.log(`[Webhook] Created usage meter for user ${userId} with ${newLimit} credits`);
      }

      console.log(`[Webhook] Successfully upgraded user ${userId} from Starter to Pro`);
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

    // Initialize usage meter for current period
    if (plan) {
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM
      await prisma.usageMeter.upsert({
        where: { userId_period: { userId, period } },
        update: { included: plan.includedAnalyses },
        create: { userId, period, included: plan.includedAnalyses, consumed: 0 },
      });
      console.log("[Webhook] Usage meter updated, limit:", plan.includedAnalyses);
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
  });

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      stripePriceId: priceId,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // Update usage meter if plan changed
  if (plan && priceId !== sub.stripePriceId) {
    const period = new Date().toISOString().slice(0, 7);
    await prisma.usageMeter.updateMany({
      where: { userId: sub.userId, period },
      data: { included: plan.includedAnalyses },
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
    create: { userId: sub.userId, period, included: plan.includedAnalyses, consumed: 0 },
  });
}


import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db/prisma";
import { getPlanByPriceId } from "@/lib/stripe/plans";
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
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(subscription);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePayment(invoice);
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log("Handling checkout completed:", session.id);
  const userId = session.metadata?.userId;
  if (!userId) {
    console.error("No userId in session metadata");
    return;
  }

  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  console.log("Creating subscription for user:", userId);

  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = stripeSubscription.items.data[0]?.price.id;
  const plan = getPlanByPriceId(priceId);

  console.log("Plan found:", plan?.name, "Price ID:", priceId);

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      status: stripeSubscription.status,
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    },
    create: {
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      status: stripeSubscription.status,
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    },
  });

  console.log("Subscription upserted successfully");

  // Initialize usage meter for current period
  if (plan) {
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    await prisma.usageMeter.upsert({
      where: { userId_period: { userId, period } },
      update: { included: plan.includedAnalyses },
      create: { userId, period, included: plan.includedAnalyses, consumed: 0 },
    });
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


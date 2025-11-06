import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { PLANS } from "@/lib/stripe/plans";
import { prisma } from "@/lib/db/prisma";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";

export async function POST(req: NextRequest) {
  try {
    // Auth required for checkout
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const email = payload.email as string;
    const body = await req.json();
    const { planId } = body;

    const plan = PLANS[planId];
    if (!plan || !plan.stripePriceId) {
      return NextResponse.json({ ok: false, error: "Invalid plan" }, { status: 400 });
    }

    // Get or create user
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email } });
    }

    // Get or create Stripe customer
    let subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
    }

    // If user has an existing subscription marked for cancellation, reactivate it
    if (subscription?.stripeSubscriptionId && subscription.cancelAtPeriodEnd) {
      console.log("User has subscription marked for cancellation, reactivating and upgrading");
      
      // Update the subscription to the new plan and remove cancellation
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
        proration_behavior: "create_prorations",
        items: [{
          id: (await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId)).items.data[0].id,
          price: plan.stripePriceId,
        }],
      });

      // Update local database
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { 
          cancelAtPeriodEnd: false,
          stripePriceId: plan.stripePriceId,
        },
      });

      // Update usage meter
      const period = new Date().toISOString().slice(0, 7);
      await prisma.usageMeter.updateMany({
        where: { userId: user.id, period },
        data: { included: plan.includedAnalyses },
      });

      return NextResponse.json({ 
        ok: true, 
        message: "Subscription reactivated and upgraded",
        upgraded: true,
      });
    }

    // If user already has an active subscription, update it instead of creating new one
    if (subscription?.stripeSubscriptionId && subscription.status === "active") {
      console.log("User has active subscription, updating to new plan");
      
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        proration_behavior: "create_prorations",
        items: [{
          id: (await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId)).items.data[0].id,
          price: plan.stripePriceId,
        }],
      });

      // Update local database
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { stripePriceId: plan.stripePriceId },
      });

      // Update usage meter
      const period = new Date().toISOString().slice(0, 7);
      await prisma.usageMeter.updateMany({
        where: { userId: user.id, period },
        data: { included: plan.includedAnalyses },
      });

      return NextResponse.json({ 
        ok: true, 
        message: "Subscription updated",
        upgraded: true,
      });
    }

    // Create Checkout session for new subscriptions
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${req.headers.get("origin")}/?success=true`,
      cancel_url: `${req.headers.get("origin")}/pricing`,
      metadata: { userId: user.id, planId },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err: unknown) {
    console.error("Checkout error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


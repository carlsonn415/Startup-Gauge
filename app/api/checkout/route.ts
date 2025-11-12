import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { PLANS } from "@/lib/stripe/plans";
import { prisma } from "@/lib/db/prisma";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";

export const dynamic = 'force-dynamic';

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

    // If user already has an active subscription and wants to upgrade
    if (subscription?.stripeSubscriptionId && subscription.status === "active") {
      const currentSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const currentPriceId = currentSubscription.items.data[0]?.price.id;
      
      // If upgrading to the same plan, don't do anything
      if (currentPriceId === plan.stripePriceId) {
        return NextResponse.json({ 
          ok: true, 
          message: "You are already on this plan",
          upgraded: false,
        });
      }

      // Special handling for Starter to Pro upgrade
      // Use the upgrade product instead of updating subscription directly
      if (planId === "pro" && currentPriceId === PLANS.starter.stripePriceId) {
        // Check if upgrade product is configured
        const upgradePlan = PLANS["starter-to-pro-upgrade"];
        if (!upgradePlan.stripePriceId) {
          return NextResponse.json({ 
            ok: false, 
            error: "Upgrade product not configured. Please set STRIPE_PRICE_STARTER_TO_PRO_UPGRADE environment variable.",
          }, { status: 500 });
        }

        // Create checkout session for the upgrade product (one-time payment)
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: "payment", // One-time payment, not subscription
          payment_method_types: ["card"],
          line_items: [{ price: upgradePlan.stripePriceId, quantity: 1 }],
          success_url: `${req.headers.get("origin")}/?success=true&upgrade=pro`,
          cancel_url: `${req.headers.get("origin")}/pricing`,
          metadata: { 
            userId: user.id, 
            planId: "pro",
            upgrade: "true",
            upgradeType: "starter-to-pro",
            currentSubscriptionId: subscription.stripeSubscriptionId,
            additionalCredits: "30",
          },
        });

        return NextResponse.json({ ok: true, url: session.url });
      }

      // For other upgrades, update subscription directly with proration
      const updatedSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        proration_behavior: "create_prorations",
        items: [{
          id: currentSubscription.items.data[0].id,
          price: plan.stripePriceId,
        }],
      });

      // Check if an invoice was created that requires payment
      if (updatedSubscription.latest_invoice) {
        const invoice = await stripe.invoices.retrieve(updatedSubscription.latest_invoice as string);
        
        // If invoice is open and requires payment, redirect to payment page
        if (invoice.status === "open" && invoice.hosted_invoice_url) {
          return NextResponse.json({ 
            ok: true, 
            url: invoice.hosted_invoice_url,
            requiresPayment: true,
          });
        }
      }

      // Payment was successful or not required - update database
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { 
          stripePriceId: plan.stripePriceId,
          status: updatedSubscription.status,
          currentPeriodEnd: new Date(updatedSubscription.current_period_end * 1000),
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
        message: "Subscription upgraded successfully. Payment processed automatically.",
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


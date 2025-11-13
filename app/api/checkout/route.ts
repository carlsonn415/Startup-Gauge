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
    if (!plan) {
      return NextResponse.json({ 
        ok: false, 
        error: `Invalid plan ID: ${planId}. Valid plans are: ${Object.keys(PLANS).filter(k => k !== "starter-to-pro-upgrade").join(", ")}` 
      }, { status: 400 });
    }

    if (!plan.stripePriceId) {
      const envVarName = planId === "starter" 
        ? "STRIPE_PRICE_STARTER" 
        : planId === "pro" 
        ? "STRIPE_PRICE_PRO" 
        : "STRIPE_PRICE_STARTER_TO_PRO_UPGRADE";
      
      return NextResponse.json({ 
        ok: false, 
        error: `Plan "${plan.name}" is not configured. Please set the ${envVarName} environment variable with a valid Stripe price ID.` 
      }, { status: 500 });
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

    // If user has an existing subscription marked for cancellation, they must go through checkout
    // to reactivate and upgrade - no direct updates allowed
    if (subscription?.stripeSubscriptionId && subscription.cancelAtPeriodEnd) {
      // Check if this is a Starter to Pro upgrade
      const currentSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const currentPriceId = currentSubscription.items.data[0]?.price.id;
      
      // Special handling for Starter to Pro upgrade from canceled subscription
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
            reactivate: "true", // Mark as reactivation since subscription is canceled
          },
        });

        return NextResponse.json({ ok: true, url: session.url });
      }

      // For other reactivations/upgrades, create new subscription checkout
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        success_url: `${req.headers.get("origin")}/?success=true`,
        cancel_url: `${req.headers.get("origin")}/pricing`,
        metadata: { 
          userId: user.id, 
          planId,
          reactivate: "true",
          oldSubscriptionId: subscription.stripeSubscriptionId,
        },
      });

      return NextResponse.json({ ok: true, url: session.url });
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

      // For other upgrades, must go through Stripe Checkout - no direct updates allowed
      // Create checkout session for the upgrade
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        success_url: `${req.headers.get("origin")}/?success=true&upgrade=true`,
        cancel_url: `${req.headers.get("origin")}/pricing`,
        metadata: { 
          userId: user.id, 
          planId,
          upgrade: "true",
          upgradeType: "subscription-upgrade",
          currentSubscriptionId: subscription.stripeSubscriptionId,
        },
      });

      return NextResponse.json({ ok: true, url: session.url });
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


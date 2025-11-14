import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { getPlans, getPlan } from "@/lib/stripe/plans";
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

    // Get plan dynamically at runtime to ensure environment variables are read fresh
    const plan = getPlan(planId);
    if (!plan) {
      const plans = getPlans();
      return NextResponse.json({ 
        ok: false, 
        error: `Invalid plan ID: ${planId}. Valid plans are: ${Object.keys(plans).filter(k => k !== "starter-to-pro-upgrade").join(", ")}` 
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

    // Validate that the price exists in Stripe before proceeding
    try {
      await stripe.prices.retrieve(plan.stripePriceId);
    } catch (priceError: any) {
      const stripeError = priceError as { type?: string; message?: string; code?: string };
      const isTestMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");
      const isLiveMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_");
      
      let errorMessage = `Stripe price "${plan.stripePriceId}" not found. `;
      
      if (stripeError.code === "resource_missing") {
        errorMessage += `The price ID does not exist in your Stripe account. `;
      }
      
      if (isTestMode && plan.stripePriceId.startsWith("price_1")) {
        // price_1 prefix suggests live mode price
        errorMessage += `You're using test mode keys (sk_test_) but the price ID appears to be from live mode. `;
        errorMessage += `Please use test mode price IDs (starting with price_) or switch to live mode keys.`;
      } else if (isLiveMode && !plan.stripePriceId.startsWith("price_1")) {
        errorMessage += `You're using live mode keys (sk_live_) but the price ID appears to be from test mode. `;
        errorMessage += `Please use live mode price IDs or switch to test mode keys.`;
      } else {
        errorMessage += `Please verify the price ID exists in your Stripe ${isTestMode ? "test" : "live"} mode account.`;
      }
      
      console.error("Stripe price validation error:", {
        priceId: plan.stripePriceId,
        planId,
        stripeMode: isTestMode ? "test" : isLiveMode ? "live" : "unknown",
        error: stripeError.message || stripeError,
      });
      
      return NextResponse.json({ 
        ok: false, 
        error: errorMessage 
      }, { status: 400 });
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
      const plans = getPlans();
      if (planId === "pro" && currentPriceId === plans.starter.stripePriceId) {
        // Check if upgrade product is configured
        const upgradePlan = plans["starter-to-pro-upgrade"];
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
      const plans = getPlans();
      if (planId === "pro" && currentPriceId === plans.starter.stripePriceId) {
        // Check if upgrade product is configured
        const upgradePlan = plans["starter-to-pro-upgrade"];
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
    
    // Handle Stripe-specific errors
    if (err && typeof err === "object" && "type" in err) {
      const stripeError = err as { type?: string; message?: string; code?: string };
      
      if (stripeError.code === "resource_missing") {
        return NextResponse.json({ 
          ok: false, 
          error: `Stripe resource not found: ${stripeError.message || "The requested resource does not exist in your Stripe account. Please verify your price IDs match your Stripe account mode (test/live)."}` 
        }, { status: 400 });
      }
      
      return NextResponse.json({ 
        ok: false, 
        error: `Stripe error: ${stripeError.message || stripeError.type || "Unknown Stripe error"}` 
      }, { status: 400 });
    }
    
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db/prisma";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    
    if (!payload || !payload.email) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    
    const userEmail = payload.email as string;
    const user = await prisma.user.findUnique({ 
      where: { email: userEmail },
      include: { subscription: true }
    });
    
    if (!user?.subscription?.stripeSubscriptionId) {
      return NextResponse.json({ ok: false, error: "No active subscription" }, { status: 400 });
    }

    // Cancel at period end (don't cancel immediately)
    await stripe.subscriptions.update(user.subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update local database
    await prisma.subscription.update({
      where: { id: user.subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    return NextResponse.json({ 
      ok: true, 
      message: "Subscription will be cancelled at the end of the billing period" 
    });
  } catch (err: unknown) {
    console.error("Cancel subscription error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


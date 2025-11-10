import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { getPlanByPriceId, PLANS } from "@/lib/stripe/plans";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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
    
    if (!user) {
      return NextResponse.json({
        ok: true,
        plan: PLANS.free,
        subscription: null,
      });
    }

    const subscription = user.subscription;
    const isActive = subscription?.status === "active" || subscription?.status === "trialing";
    
    let currentPlan = PLANS.free;
    if (isActive && subscription?.stripePriceId) {
      const plan = getPlanByPriceId(subscription.stripePriceId);
      if (plan) currentPlan = plan;
    }

    return NextResponse.json({
      ok: true,
      plan: currentPlan,
      subscription: subscription ? {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      } : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


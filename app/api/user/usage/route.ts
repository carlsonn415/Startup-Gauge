import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { prisma } from "@/lib/db/prisma";
import { PLANS } from "@/lib/stripe/plans";
import { getPlanByPriceId } from "@/lib/stripe/plans";
import { successResponse, errorResponse, handleApiError } from "@/lib/api/errors";

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    
    if (!payload || !payload.email) {
      return errorResponse("Unauthorized", 401, "UNAUTHORIZED");
    }
    
    const userEmail = payload.email as string;
    const user = await prisma.user.findUnique({ 
      where: { email: userEmail },
      include: { subscription: true }
    });
    
    if (!user) {
      return errorResponse("User not found", 404, "USER_NOT_FOUND");
    }

    // Determine plan
    const subscription = user.subscription;
    const isActive = subscription?.status === "active" || subscription?.status === "trialing";
    
    let plan = PLANS.free;
    if (isActive && subscription?.stripePriceId) {
      const activePlan = getPlanByPriceId(subscription.stripePriceId);
      if (activePlan) {
        plan = activePlan;
      }
    }

    // Get current period usage meter
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const meter = await prisma.usageMeter.findUnique({
      where: { userId_period: { userId: user.id, period } },
    });

    const consumed = meter?.consumed || 0;
    const included = meter?.included || plan.includedAnalyses;
    const remaining = Math.max(0, included - consumed);

    return successResponse({
      consumed,
      limit: included,
      remaining,
      period,
      plan: plan.name,
    });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}


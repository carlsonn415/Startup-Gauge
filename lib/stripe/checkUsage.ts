import { prisma } from "@/lib/db/prisma";
import { PLANS } from "@/lib/stripe/plans";

/**
 * Get or create usage meter and determine user's plan
 */
async function getUsageMeter(userId: string) {
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Get user's subscription
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  const isActive = subscription?.status === "active" || subscription?.status === "trialing";

  // Determine plan
  let plan = PLANS.free;
  if (isActive && subscription?.stripePriceId) {
    const activePlan = Object.values(PLANS).find((p) => p.stripePriceId === subscription.stripePriceId);
    if (activePlan) {
      plan = activePlan;
      console.log(`User ${userId} has active plan: ${plan.name} (${plan.includedAnalyses} analyses)`);
    }
  } else {
    console.log(`User ${userId} on free plan (${PLANS.free.includedAnalyses} analyses)`);
  }

  // Get or create usage meter
  let meter = await prisma.usageMeter.findUnique({
    where: { userId_period: { userId, period } },
  });

  if (!meter) {
    console.log(`Creating new usage meter for user ${userId}, period ${period}, limit ${plan.includedAnalyses}`);
    meter = await prisma.usageMeter.create({
      data: { 
        userId, 
        period, 
        included: plan.includedAnalyses, 
        consumed: 0,
      },
    });
  } else if (meter.included !== plan.includedAnalyses) {
    // Plan changed - update the limit
    console.log(`Updating usage meter limit from ${meter.included} to ${plan.includedAnalyses}`);
    meter = await prisma.usageMeter.update({
      where: { id: meter.id },
      data: { included: plan.includedAnalyses },
    });
  }

  return { meter, plan };
}

/**
 * Check if user has remaining usage without incrementing
 */
export async function checkUsage(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const { meter } = await getUsageMeter(userId);
  const remaining = meter.included - meter.consumed;
  console.log(`Usage check: ${meter.consumed}/${meter.included} used, ${remaining} remaining`);
  
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, limit: meter.included };
  }

  return { allowed: true, remaining, limit: meter.included };
}

/**
 * Increment usage meter (only call after successful completion)
 */
export async function incrementUsage(userId: string): Promise<{
  remaining: number;
  limit: number;
}> {
  const { meter } = await getUsageMeter(userId);
  
  // Increment usage
  const updated = await prisma.usageMeter.update({
    where: { id: meter.id },
    data: { consumed: { increment: 1 } },
  });

  const remaining = updated.included - updated.consumed;
  console.log(`Usage incremented: now ${updated.consumed}/${updated.included}, ${remaining} remaining`);
  return { remaining, limit: updated.included };
}

/**
 * @deprecated Use checkUsage() and incrementUsage() separately instead
 * Check and increment usage in one call (for backwards compatibility)
 */
export async function checkAndIncrementUsage(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const check = await checkUsage(userId);
  if (!check.allowed) {
    return check;
  }
  
  const result = await incrementUsage(userId);
  return { allowed: true, ...result };
}


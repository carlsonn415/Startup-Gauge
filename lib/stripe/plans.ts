export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  stripePriceId: string;
  includedAnalyses: number;
  features: string[];
}

// Base plan definitions (without dynamic stripePriceId)
const PLAN_DEFINITIONS: Omit<Plan, 'stripePriceId'>[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    includedAnalyses: 3,
    features: ["3 analyses per month", "Full viability reports", "Email support"],
  },
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 5,
    includedAnalyses: 20,
    features: [
      "20 analyses per month",
      "Full viability reports",
      "Priority email support",
      "Export to PDF",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 15,
    includedAnalyses: 50,
    features: [
      "50 analyses per month",
      "Full viability reports",
      "Priority email support",
      "Export to PDF",
      "Ask follow up questions about your viability reports",
    ],
  },
  {
    id: "starter-to-pro-upgrade",
    name: "Starter to Pro Upgrade",
    priceMonthly: 10, // One-time upgrade price (difference between Pro $15 and Starter $5)
    includedAnalyses: 30, // Additional credits added when upgrading (50 - 20)
    features: [
      "Upgrade from Starter to Pro",
      "Add 30 analysis credits",
      "Pro plan features",
    ],
  },
];

/**
 * Get plans with stripePriceId populated from environment variables at runtime
 * This ensures environment variables are read fresh on each request in serverless environments
 */
export function getPlans(): Record<string, Plan> {
  const plans: Record<string, Plan> = {};
  
  for (const planDef of PLAN_DEFINITIONS) {
    let stripePriceId = "";
    
    if (planDef.id === "starter") {
      stripePriceId = process.env.STRIPE_PRICE_STARTER || "";
    } else if (planDef.id === "pro") {
      stripePriceId = process.env.STRIPE_PRICE_PRO || "";
    } else if (planDef.id === "starter-to-pro-upgrade") {
      stripePriceId = process.env.STRIPE_PRICE_STARTER_TO_PRO_UPGRADE || "";
    } else {
      stripePriceId = "test_price_id";
    }
    // free plan has no stripePriceId
    
    plans[planDef.id] = {
      ...planDef,
      stripePriceId,
    };
  }
  
  return plans;
}

/**
 * Get a single plan by ID
 */
export function getPlan(planId: string): Plan | null {
  const plans = getPlans();
  return plans[planId] || null;
}

/**
 * Get all plans (for backward compatibility)
 * @deprecated Use getPlans() instead for runtime environment variable access
 */
export const PLANS: Record<string, Plan> = getPlans();

export function getPlanByPriceId(priceId: string): Plan | null {
  const plans = getPlans();
  for (const plan of Object.values(plans)) {
    if (plan.stripePriceId === priceId) return plan;
  }
  return null;
}


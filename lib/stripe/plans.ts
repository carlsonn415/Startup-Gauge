export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  stripePriceId: string;
  includedAnalyses: number;
  features: string[];
}

export const PLANS: Record<string, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    stripePriceId: "", // No Stripe price for free tier
    includedAnalyses: 3,
    features: ["3 analyses per month", "Full viability reports", "Email support"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 5,
    stripePriceId: process.env.STRIPE_PRICE_STARTER || "",
    includedAnalyses: 20,
    features: [
      "20 analyses per month",
      "Full viability reports",
      "Priority email support",
      "Export to PDF",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 15,
    stripePriceId: process.env.STRIPE_PRICE_PRO || "",
    includedAnalyses: 50,
    features: [
      "50 analyses per month",
      "Full viability reports",
      "Priority email support",
      "Export to PDF",
      "Ask follow up questions about your viability reports",
    ],
  },
  "starter-to-pro-upgrade": {
    id: "starter-to-pro-upgrade",
    name: "Starter to Pro Upgrade",
    priceMonthly: 10, // One-time upgrade price (difference between Pro $15 and Starter $5)
    stripePriceId: process.env.STRIPE_PRICE_STARTER_TO_PRO_UPGRADE || "",
    includedAnalyses: 30, // Additional credits added when upgrading (50 - 20)
    features: [
      "Upgrade from Starter to Pro",
      "Add 30 analysis credits",
      "Pro plan features",
    ],
  },
};

export function getPlanByPriceId(priceId: string): Plan | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceId === priceId) return plan;
  }
  return null;
}


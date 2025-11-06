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
    features: ["3 analyses per month", "Basic viability reports", "Email support"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    stripePriceId: process.env.STRIPE_PRICE_STARTER || "",
    includedAnalyses: 25,
    features: [
      "25 analyses per month",
      "Detailed viability reports",
      "Priority email support",
      "Export to PDF",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 99,
    stripePriceId: process.env.STRIPE_PRICE_PRO || "",
    includedAnalyses: 100,
    features: [
      "100 analyses per month",
      "Advanced reports with scenarios",
      "Document uploads (RAG)",
      "Priority support",
      "API access",
    ],
  },
};

export function getPlanByPriceId(priceId: string): Plan | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceId === priceId) return plan;
  }
  return null;
}


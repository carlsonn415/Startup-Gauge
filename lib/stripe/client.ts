import Stripe from "stripe";

const apiKey = process.env.STRIPE_SECRET_KEY;
if (!apiKey) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripe = new Stripe(apiKey, {
  apiVersion: "2024-11-20.acacia",
  typescript: true,
});


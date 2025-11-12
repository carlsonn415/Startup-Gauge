import { z } from "zod";

export const ViabilityInputSchema = z.object({
  idea: z.string().min(10),
  targetMarket: z.string().min(2),
  budgetUsd: z.coerce.number().nonnegative().default(0),
  timelineMonths: z.coerce.number().int().positive().default(6),
});
export type ViabilityInput = z.infer<typeof ViabilityInputSchema>;

export const StepSchema = z.object({
  title: z.string(),
  description: z.string(),
  durationWeeks: z.number().int().positive(),
});

export const ProfitModelSchema = z.object({
  cacUsd: z.number().nonnegative(),
  ltvUsd: z.number().nonnegative(),
  grossMarginPct: z.number().min(0).max(100),
  breakEvenMonths: z.number().int().nonnegative(),
  monthlyProjection: z.array(
    z.object({ month: z.number().int().positive(), revenueUsd: z.number(), costUsd: z.number() })
  ),
});

export const RiskSchema = z.object({
  description: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  impact: z.string(), // Explanation of why this risk matters
});

export const ViabilityOutputSchema = z.object({
  summary: z.string(),
  marketSizeUsd: z.number().nonnegative(),
  marketSizeExplanation: z.string(), // Explanation of how market size was calculated
  risks: z.array(RiskSchema).max(10),
  steps: z.array(StepSchema).min(3),
  profitModel: ProfitModelSchema,
  confidencePct: z.number().min(0).max(100),
  confidenceReasoning: z.string(), // Explanation of why this confidence score was assigned
});
export type ViabilityOutput = z.infer<typeof ViabilityOutputSchema>;


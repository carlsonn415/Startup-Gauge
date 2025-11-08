import { prisma } from "@/lib/db/prisma";

export interface PromptConfig {
  systemPrompt: string;
  outputSchemaVersion: number;
  name: string;
}

export async function getPromptVersion(name: string = "v1-default"): Promise<PromptConfig | null> {
  const version = await prisma.promptVersion.findFirst({
    where: { name },
  });
  if (!version) return null;
  return {
    systemPrompt: version.systemPrompt,
    outputSchemaVersion: version.outputSchemaVersion,
    name: version.name,
  };
}

export async function getOrCreateDefaultPrompt(): Promise<PromptConfig> {
  let version = await prisma.promptVersion.findFirst({
    where: { name: "v1-default" },
  });

  const fullPrompt = `You are an expert startup consultant. Produce realistic, conservative estimates. You MUST return valid JSON matching this exact structure:

{
  "summary": "A 2-3 sentence summary of the business idea and its viability",
  "marketSizeUsd": 1000000,
  "risks": ["Risk 1", "Risk 2", "Risk 3"],
  "steps": [
    {
      "title": "Step title",
      "description": "Step description",
      "durationWeeks": 4
    }
  ],
  "profitModel": {
    "cacUsd": 50,
    "ltvUsd": 500,
    "grossMarginPct": 60,
    "breakEvenMonths": 12,
    "monthlyProjection": [
      {"month": 1, "revenueUsd": 1000, "costUsd": 2000},
      {"month": 2, "revenueUsd": 2000, "costUsd": 1800}
    ]
  },
  "confidencePct": 75
}

Return ONLY valid JSON, no markdown, no code fences, no explanations.`;

  if (!version) {
    version = await prisma.promptVersion.create({
      data: {
        name: "v1-default",
        systemPrompt: fullPrompt,
        outputSchemaVersion: 1,
      },
    });
  } else if (version.systemPrompt.length < 200) {
    // Update incomplete prompts (from old seed data)
    console.log("Updating incomplete prompt version...");
    version = await prisma.promptVersion.update({
      where: { id: version.id },
      data: { systemPrompt: fullPrompt },
    });
  }

  return {
    systemPrompt: version.systemPrompt,
    outputSchemaVersion: version.outputSchemaVersion,
    name: version.name,
  };
}


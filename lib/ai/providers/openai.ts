import OpenAI from "openai";
import { AiProvider } from "@/lib/ai/provider";
import { ViabilityInput, ViabilityOutput, ViabilityOutputSchema } from "@/lib/ai/schemas";
import { PromptConfig } from "@/lib/ai/promptManager";

// Lazy-load client to allow dotenv to load first
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

export class OpenAiProvider implements AiProvider {
  constructor(private promptConfig?: PromptConfig) {}

  async generateViability(
    input: ViabilityInput, 
    promptConfig?: PromptConfig,
    ragContext?: string
  ): Promise<{
    output: ViabilityOutput;
    model: string;
    promptTokens: number;
    completionTokens: number;
  }> {
    const systemPrompt = promptConfig?.systemPrompt || this.promptConfig?.systemPrompt || "";
    if (!systemPrompt) {
      throw new Error("System prompt is required");
    }

    // Build user prompt with optional RAG context
    const promptParts = [
      `Analyze this business idea:`,
      `Idea: ${input.idea}`,
      `Target market: ${input.targetMarket}`,
      `Budget (USD): ${input.budgetUsd}`,
      `Timeline (months): ${input.timelineMonths}`,
    ];

    if (ragContext && ragContext.length > 0) {
      promptParts.push(
        ``,
        `--- Context from Market Research ---`,
        `The following information was extracted from competitor websites, market reports, and industry research:`,
        ``,
        ragContext,
        ``,
        `--- End of Context ---`,
        ``,
        `Use the above context to inform your analysis with real market data, competitor insights, and industry trends.`
      );
    }

    promptParts.push(``, `Return the JSON object with your analysis.`);
    const userPrompt = promptParts.join("\n");

    const client = getClient();
    
    // Log the system prompt to debug
    console.log("System prompt length:", systemPrompt.length);
    console.log("System prompt preview:", systemPrompt.substring(0, 200));
    
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const content = response.choices?.[0]?.message?.content ?? "{}";
    console.log("OpenAI raw response:", content.substring(0, 500));
    
    // Attempt to parse JSON even if wrapped in code fences
    const jsonText = content.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
      console.log("Parsed JSON keys:", Object.keys(parsed));
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", content);
      throw new Error(`Invalid JSON response from OpenAI: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }
    
    // Validate against schema
    let output;
    try {
      output = ViabilityOutputSchema.parse(parsed);
    } catch (validationError) {
      console.error("Schema validation failed. Parsed data:", JSON.stringify(parsed, null, 2));
      console.error("Validation error:", validationError);
      throw new Error(`OpenAI response doesn't match expected schema: ${validationError instanceof Error ? validationError.message : "Unknown error"}`);
    }
    const usage = response.usage;
    return {
      output,
      model: response.model || "gpt-4o-mini",
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    };
  }
}


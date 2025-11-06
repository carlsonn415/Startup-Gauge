import { ViabilityInput, ViabilityOutput } from "@/lib/ai/schemas";
import { PromptConfig } from "@/lib/ai/promptManager";

export interface AiProvider {
  generateViability(
    input: ViabilityInput, 
    promptConfig?: PromptConfig,
    ragContext?: string
  ): Promise<{
    output: ViabilityOutput;
    model: string;
    promptTokens: number;
    completionTokens: number;
  }>;
}


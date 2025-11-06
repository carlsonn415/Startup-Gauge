import { OpenAiProvider } from "@/lib/ai/providers/openai";
import { ViabilityInput } from "@/lib/ai/schemas";
import { getOrCreateDefaultPrompt } from "@/lib/ai/promptManager";

export interface EvalTestCase {
  name: string;
  input: ViabilityInput;
  expectedFields: string[]; // Fields that must be present
}

export interface EvalResult {
  testName: string;
  passed: boolean;
  errors: string[];
  output?: any;
}

export async function runEval(testCases: EvalTestCase[]): Promise<EvalResult[]> {
  const promptConfig = await getOrCreateDefaultPrompt();
  const provider = new OpenAiProvider();
  const results: EvalResult[] = [];

  for (const testCase of testCases) {
    const result: EvalResult = {
      testName: testCase.name,
      passed: false,
      errors: [],
    };

    try {
      const { output } = await provider.generateViability(testCase.input, promptConfig);
      result.output = output;

      // Check that all expected fields are present
      for (const field of testCase.expectedFields) {
        if (!(field in output)) {
          result.errors.push(`Missing required field: ${field}`);
        }
      }

      // Basic validation
      if (typeof output.summary !== "string" || output.summary.length === 0) {
        result.errors.push("summary must be a non-empty string");
      }
      if (typeof output.marketSizeUsd !== "number" || output.marketSizeUsd < 0) {
        result.errors.push("marketSizeUsd must be a non-negative number");
      }
      if (!Array.isArray(output.risks)) {
        result.errors.push("risks must be an array");
      }
      if (!Array.isArray(output.steps) || output.steps.length < 3) {
        result.errors.push("steps must be an array with at least 3 items");
      }
      if (typeof output.confidencePct !== "number" || output.confidencePct < 0 || output.confidencePct > 100) {
        result.errors.push("confidencePct must be a number between 0 and 100");
      }

      result.passed = result.errors.length === 0;
    } catch (error) {
      result.errors.push(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    results.push(result);
  }

  return results;
}


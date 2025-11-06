import { config } from "dotenv";
import { resolve } from "path";

// Load .env file before importing anything else
config({ path: resolve(process.cwd(), ".env") });

import { runEval, EvalTestCase } from "@/lib/ai/eval/runEval";

const testCases: EvalTestCase[] = [
  {
    name: "SaaS Startup",
    input: {
      idea: "A project management tool for remote teams",
      targetMarket: "Remote-first companies with 10-100 employees",
      budgetUsd: 50000,
      timelineMonths: 12,
    },
    expectedFields: ["summary", "marketSizeUsd", "risks", "steps", "profitModel", "confidencePct"],
  },
  {
    name: "E-commerce Platform",
    input: {
      idea: "Online marketplace for handmade crafts",
      targetMarket: "Artisans and craft enthusiasts",
      budgetUsd: 25000,
      timelineMonths: 6,
    },
    expectedFields: ["summary", "marketSizeUsd", "risks", "steps", "profitModel", "confidencePct"],
  },
];

async function main() {
  console.log("Running eval tests...\n");
  const results = await runEval(testCases);

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      passed++;
      console.log(`✅ ${result.testName}: PASSED`);
    } else {
      failed++;
      console.log(`❌ ${result.testName}: FAILED`);
      for (const error of result.errors) {
        console.log(`   - ${error}`);
      }
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);


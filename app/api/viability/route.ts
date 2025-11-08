import { NextRequest, NextResponse } from "next/server";
import { ViabilityInputSchema } from "@/lib/ai/schemas";
import { OpenAiProvider } from "@/lib/ai/providers/openai";
import { prisma } from "@/lib/db/prisma";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { checkAndIncrementUsage } from "@/lib/stripe/checkUsage";
import { searchSimilarChunks, hasIngestedDocuments } from "@/lib/rag/vectorSearch";
import { errorResponse, successResponse, handleApiError } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
  try {
    // Always require auth for usage tracking
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    
    if (!payload || !payload.email) {
      return errorResponse("Unauthorized - Please sign in", 401, "UNAUTHORIZED");
    }
    
    const userEmail = payload.email as string;
    
    let body;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON in request body", 400, "INVALID_JSON");
    }

    let input;
    try {
      input = ViabilityInputSchema.parse(body);
    } catch (err) {
      return handleApiError(err);
    }
    
    // Get or create user
    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: { email: userEmail },
    });
    
    // Check usage limits
    const usageCheck = await checkAndIncrementUsage(user.id);
    if (!usageCheck.allowed) {
      return errorResponse(
        `You've reached your monthly limit of ${usageCheck.limit} analyses. Upgrade your plan for more analyses.`,
        429,
        "USAGE_LIMIT_EXCEEDED",
        { limit: usageCheck.limit, remaining: 0 }
      );
    }
    
    // Get or create default prompt version
    const { getOrCreateDefaultPrompt } = await import("@/lib/ai/promptManager");
    const promptConfig = await getOrCreateDefaultPrompt();
    
    // Load prompt version from DB
    let promptVersion = await prisma.promptVersion.findFirst({
      where: { name: promptConfig.name },
    });
    if (!promptVersion) {
      promptVersion = await prisma.promptVersion.create({
        data: {
          name: promptConfig.name,
          systemPrompt: promptConfig.systemPrompt,
          outputSchemaVersion: promptConfig.outputSchemaVersion,
        },
      });
    }

    // Check if project already exists (for RAG lookups)
    const existingProject = body.projectId 
      ? await prisma.project.findFirst({ where: { id: body.projectId, userId: user.id } })
      : null;

    // If project exists, try to retrieve RAG context
    let ragContext = "";
    if (existingProject) {
      const hasDocuments = await hasIngestedDocuments(existingProject.id);
      if (hasDocuments) {
        console.log(`Retrieving RAG context for project ${existingProject.id}`);
        const searchResults = await searchSimilarChunks(
          existingProject.id,
          input.idea,
          5 // Top 5 most relevant chunks
        );

        if (searchResults.length > 0) {
          ragContext = searchResults
            .map(
              (r, i) =>
                `[Source ${i + 1}: ${r.sourceTitle || r.sourceUrl}]\n${r.content}\n`
            )
            .join("\n");

          console.log(`Found ${searchResults.length} relevant chunks for RAG`);
        }
      }
    }

    const provider = new OpenAiProvider();
    const { output, model, promptTokens, completionTokens } = await provider.generateViability(
      input, 
      promptConfig,
      ragContext
    );

    // Use existing project or create a new one
    const project = existingProject || await prisma.project.create({
      data: {
        userId: user.id,
        title: input.idea.slice(0, 60),
        description: input.targetMarket,
      },
    });

    // Rough cost estimate (adjust later with exact pricing)
    const promptCostPer1k = 0.005; // USD per 1K tokens
    const completionCostPer1k = 0.015; // USD per 1K tokens
    const costUsd =
      (promptTokens / 1000) * promptCostPer1k + (completionTokens / 1000) * completionCostPer1k;

    const analysis = await prisma.analysis.create({
      data: {
        projectId: project.id,
        input: input as any,
        output: output as any,
        model,
        promptVersionId: promptVersion.id,
        tokenUsage: promptTokens + completionTokens,
        costUsd,
        status: "success",
      },
    });

    return successResponse(output, 200, {
      model,
      promptTokens,
      completionTokens,
      costUsd,
      projectId: project.id,
      analysisId: analysis.id,
      usage: {
        remaining: usageCheck.remaining,
        limit: usageCheck.limit,
      },
    });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}


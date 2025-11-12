import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { prisma } from "@/lib/db/prisma";
import { errorResponse, successResponse, handleApiError } from "@/lib/api/errors";
import { searchSimilarChunks, hasIngestedDocuments } from "@/lib/rag/vectorSearch";
import { getPlanByPriceId, PLANS } from "@/lib/stripe/plans";
import OpenAI from "openai";

export const dynamic = 'force-dynamic';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Auth required
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    if (!payload) {
      return errorResponse("Unauthorized", 401, "UNAUTHORIZED");
    }

    const email = payload.email as string;
    const { id: projectId } = params;

    // Get user with subscription
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { subscription: true }
    });
    if (!user) {
      return errorResponse("User not found", 404, "USER_NOT_FOUND");
    }

    // Check if user has Pro plan
    const subscription = user.subscription;
    const isActive = subscription?.status === "active" || subscription?.status === "trialing";
    
    let currentPlan = PLANS.free;
    if (isActive && subscription?.stripePriceId) {
      const plan = getPlanByPriceId(subscription.stripePriceId);
      if (plan) currentPlan = plan;
    }

    if (currentPlan.id !== "pro") {
      return errorResponse(
        "Pro plan subscription required for AI chat feature",
        403,
        "PRO_PLAN_REQUIRED"
      );
    }

    // Verify project exists and belongs to user
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: user.id,
      },
    });

    if (!project) {
      return errorResponse("Project not found", 404, "PROJECT_NOT_FOUND");
    }

    // Get question from request body
    const body = await req.json();
    const { question } = body;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return errorResponse("Question is required", 400, "INVALID_QUESTION");
    }

    // Get latest analysis for context
    const latestAnalysis = await prisma.analysis.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    // Try to retrieve RAG context
    let ragContext = "";
    let hasRagData = false;
    let searchResults: Array<{ sourceUrl: string; sourceTitle: string | null }> = [];
    
    if (await hasIngestedDocuments(projectId)) {
      const results = await searchSimilarChunks(
        projectId,
        question,
        10 // Top 10 most relevant chunks
      );

      if (results.length > 0) {
        hasRagData = true;
        ragContext = results
          .map(
            (r, i) =>
              `[Source ${i + 1}: ${r.sourceTitle || r.sourceUrl}]\n${r.content}\n`
          )
          .join("\n");
        
        // Store sources for response (limit to top 5 for display)
        searchResults = results.slice(0, 5).map(r => ({
          sourceUrl: r.sourceUrl,
          sourceTitle: r.sourceTitle || r.sourceUrl,
        }));
      }
    }

    // Build prompt for OpenAI
    const client = getOpenAIClient();
    
    const systemPrompt = `You are a helpful business viability analyst assistant. Your role is to answer questions about business viability reports using available data sources. 

IMPORTANT GUIDELINES:
- Always prioritize information from the RAG context (market research data) when available
- If RAG context is provided, use it extensively to answer the question
- If no relevant RAG data is available, clearly state this and recommend the user do their own research
- Be concise and direct in your answers
- Reference specific sources when using RAG data
- If the question cannot be answered with available data, say so clearly`;

    const promptParts = [
      `Question: ${question.trim()}`,
      ``,
    ];

        if (latestAnalysis?.output) {
          const output = latestAnalysis.output as any;
          promptParts.push(
            `--- Report Summary ---`,
            `Business Idea: ${project.title}`,
            `Market Size: $${output.marketSizeUsd?.toLocaleString() || 'N/A'}`,
            `Confidence Score: ${output.confidencePct || 'N/A'}%`,
            `Key Risks: ${output.risks?.slice(0, 3).map((r: any) => typeof r === 'string' ? r : r.description).join('; ') || 'N/A'}`,
            ``,
          );
        }

    if (hasRagData && ragContext) {
      promptParts.push(
        `--- Market Research Data (RAG Context) ---`,
        `The following information was extracted from competitor websites, market reports, and industry research:`,
        ``,
        ragContext,
        ``,
        `--- End of Market Research Data ---`,
        ``,
        `Use the above market research data to answer the question. If the data directly addresses the question, cite the sources.`
      );
    } else {
      promptParts.push(
        `--- Note ---`,
        `No market research data (RAG context) is available for this project.`,
        `If you cannot answer the question based on the report summary alone, inform the user that additional research is needed.`
      );
    }

    promptParts.push(
      ``,
      `Please provide a clear, concise answer to the question.`
    );

    const userPrompt = promptParts.join("\n");

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const answer = response.choices?.[0]?.message?.content || "I apologize, but I couldn't generate an answer. Please try again.";

    return successResponse({
      answer,
      hasRagData,
      sources: searchResults.map(r => ({
        url: r.sourceUrl,
        title: r.sourceTitle,
      })),
    });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}


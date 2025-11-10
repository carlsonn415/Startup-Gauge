import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { prisma } from "@/lib/db/prisma";
import { successResponse, errorResponse, handleApiError } from "@/lib/api/errors";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    
    if (!payload || !payload.email) {
      return errorResponse("Unauthorized", 401, "UNAUTHORIZED");
    }

    const userEmail = payload.email as string;
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    
    if (!user) {
      return successResponse([]);
    }

    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      include: {
        analyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        discoveryJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            documentChunks: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return successResponse(projects.map((p) => {
      const latestAnalysis = p.analyses[0];
      const confidenceScore = latestAnalysis?.output && typeof latestAnalysis.output === 'object' && 'confidencePct' in latestAnalysis.output
        ? (latestAnalysis.output as any).confidencePct
        : null;

      return {
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        hasAnalysis: p.analyses.length > 0,
        hasDocuments: p._count.documentChunks > 0,
        latestJobStatus: p.discoveryJobs[0]?.status || null,
        confidenceScore,
      };
    }));
  } catch (err: unknown) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    
    if (!payload || !payload.email) {
      return errorResponse("Unauthorized", 401, "UNAUTHORIZED");
    }

    const userEmail = payload.email as string;
    const body = await req.json();
    const { title, description } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return errorResponse("Title is required", 400, "VALIDATION_ERROR");
    }

    // Get or create user
    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: { email: userEmail },
    });

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title: title.trim(),
        description: description?.trim() || null,
        status: "in_progress",
      },
    });

    return successResponse({
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt,
    }, 201);
  } catch (err: unknown) {
    // Log the full error for debugging
    console.error("[API] Error creating project:", err);
    if (err instanceof Error) {
      console.error("[API] Error message:", err.message);
      console.error("[API] Error stack:", err.stack);
    }
    return handleApiError(err);
  }
}


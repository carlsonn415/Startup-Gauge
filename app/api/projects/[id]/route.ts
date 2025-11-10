import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { prisma } from "@/lib/db/prisma";
import { errorResponse, successResponse, handleApiError } from "@/lib/api/errors";

export const dynamic = 'force-dynamic';

export async function GET(
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
    const { id } = params;

    // Get user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return errorResponse("User not found", 404, "USER_NOT_FOUND");
    }

    // Get project
    // Note: Using findFirst instead of findUnique since we're filtering by both id and userId
    const project = await prisma.project.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        analyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            documentChunks: true,
          },
        },
      },
    }).catch((err) => {
      console.error(`[API] Error fetching project ${id} for user ${user.id}:`, err);
      throw err;
    });

    if (!project) {
      return errorResponse("Project not found", 404, "PROJECT_NOT_FOUND");
    }

    return successResponse({
      id: project.id,
      title: project.title,
      description: project.description,
      businessIdea: project.title, // Using title as businessIdea for compatibility
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      latestAnalysis: project.analyses[0] || null,
      hasDocuments: project._count.documentChunks > 0,
    });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}

export async function DELETE(
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
    const { id } = params;

    // Get user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return errorResponse("User not found", 404, "USER_NOT_FOUND");
    }

    // Verify project exists and belongs to user
    const project = await prisma.project.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!project) {
      return errorResponse("Project not found", 404, "PROJECT_NOT_FOUND");
    }

    // Delete project (cascade deletes will handle related records)
    await prisma.project.delete({
      where: { id },
    });

    return successResponse({ message: "Project deleted successfully" });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}


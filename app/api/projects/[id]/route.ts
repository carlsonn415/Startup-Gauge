import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Auth required
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const email = payload.email as string;
    const { id } = params;

    // Get user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // Get project
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
    });

    if (!project) {
      return NextResponse.json(
        { ok: false, error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        businessIdea: project.title, // Using title as businessIdea for compatibility
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        latestAnalysis: project.analyses[0] || null,
        hasDocuments: project._count.documentChunks > 0,
      },
    });
  } catch (err: unknown) {
    console.error("Project fetch error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


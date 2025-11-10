import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { prisma } from "@/lib/db/prisma";

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    // Auth required
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = params;

    const job = await prisma.discoveryJob.findUnique({
      where: { id: jobId },
      include: {
        project: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { ok: false, error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user owns this job
    const email = payload.email as string;
    if (job.project.user.email !== email) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        urlCount: job.urlCount,
        chunksCount: job.chunksCount,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      },
    });
  } catch (err: unknown) {
    console.error("Job status error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { prisma } from "@/lib/db/prisma";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export async function POST(req: NextRequest) {
  try {
    // Auth required
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const email = payload.email as string;
    const body = await req.json();
    const { projectId, urls } = body;

    if (!projectId || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { ok: false, error: "projectId and urls array are required" },
        { status: 400 }
      );
    }

    // Get or create user
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email } });
    }

    // Verify project exists and belongs to user
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: user.id,
      },
    });

    if (!project) {
      return NextResponse.json(
        { ok: false, error: "Project not found or unauthorized" },
        { status: 404 }
      );
    }

    // Create discovery job
    const job = await prisma.discoveryJob.create({
      data: {
        projectId,
        status: "pending",
        urlCount: urls.length,
      },
    });

    console.log(`Created discovery job ${job.id} for project ${projectId}`);

    // Invoke Lambda asynchronously
    const lambdaPayload = {
      jobId: job.id,
      projectId,
      userId: user.id,
      urls,
    };

    try {
      const command = new InvokeCommand({
        FunctionName: process.env.RAG_LAMBDA_FUNCTION_NAME || "rag-ingestion-worker",
        InvocationType: "Event", // Async invocation
        Payload: Buffer.from(JSON.stringify(lambdaPayload)),
      });

      await lambdaClient.send(command);
      console.log(`Lambda invoked for job ${job.id}`);

      // Update job status to processing
      await prisma.discoveryJob.update({
        where: { id: job.id },
        data: { status: "processing" },
      });
    } catch (lambdaError) {
      console.error("Lambda invocation failed:", lambdaError);
      
      // Update job status to failed
      await prisma.discoveryJob.update({
        where: { id: job.id },
        data: { status: "failed" },
      });

      return NextResponse.json(
        { ok: false, error: "Failed to start ingestion worker" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status: "processing",
      message: `Ingesting ${urls.length} URLs in the background`,
    });
  } catch (err: unknown) {
    console.error("Ingestion trigger error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

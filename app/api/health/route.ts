import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Health check endpoint for monitoring and uptime checks
 * Returns 200 OK if the application and database are healthy
 */
export async function GET() {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (error) {
    // Database connection failed
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}


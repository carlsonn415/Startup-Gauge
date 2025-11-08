import { Handler } from "aws-lambda";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import * as cheerio from "cheerio";
import pdfParse from "pdf-parse";

// Initialize Prisma Client with proper configuration for Lambda
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface LambdaEvent {
  jobId: string;
  projectId: string;
  userId: string;
  urls: Array<{
    url: string;
    title: string;
    category: string;
    relevanceScore: number;
    reason: string;
  }>;
}

export const handler: Handler<LambdaEvent> = async (event) => {
  console.log("Starting ingestion job:", event.jobId);

  try {
    // Update job status to processing
    await prisma.discoveryJob.update({
      where: { id: event.jobId },
      data: { status: "processing" },
    });

    let totalChunks = 0;

    // Process each URL
    for (const urlData of event.urls) {
      try {
        console.log(`Processing: ${urlData.url}`);

        // Step 1: Fetch content
        const content = await fetchContent(urlData.url);
        if (!content) {
          console.warn(`Skipping ${urlData.url} - failed to fetch content`);
          continue;
        }

        // Step 2: Chunk text
        const chunks = chunkText(content, 1000, 200);
        console.log(`Created ${chunks.length} chunks from ${urlData.url}`);

        // Step 3: Generate embeddings (batch processing)
        const embeddings = await generateEmbeddings(chunks);

        // Step 4: Store in database using raw SQL for embedding field (pgvector)
        for (let idx = 0; idx < chunks.length; idx++) {
          const chunk = chunks[idx];
          const embedding = embeddings[idx];
          
          if (!embedding) {
            console.warn(`No embedding for chunk ${idx}, skipping`);
            continue;
          }
          
          // Format embedding as pgvector array string
          const embeddingVector = `[${embedding.join(",")}]`;
          
          // Use raw SQL to insert with pgvector embedding
          await prisma.$executeRawUnsafe(
            `INSERT INTO "DocumentChunk" 
             ("id", "projectId", "sourceUrl", "chunkIndex", "content", "embedding", "metadata", "createdAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, $6::jsonb, NOW())`,
            event.projectId,
            urlData.url,
            idx,
            chunk,
            embeddingVector,
            JSON.stringify({
              title: urlData.title,
              category: urlData.category,
              relevanceScore: urlData.relevanceScore,
              reason: urlData.reason,
            })
          );
        }

        totalChunks += chunks.length;
        console.log(`Stored ${chunks.length} chunks for ${urlData.url}`);

        // Small delay to avoid rate limiting
        await delay(500);
      } catch (urlError) {
        console.error(`Failed to process ${urlData.url}:`, urlError);
        // Continue with next URL
      }
    }

    // Update job status to completed
    await prisma.discoveryJob.update({
      where: { id: event.jobId },
      data: {
        status: "completed",
        chunksCount: totalChunks,
        completedAt: new Date(),
      },
    });

    console.log(`Job ${event.jobId} completed. Total chunks: ${totalChunks}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        totalChunks,
      }),
    };
  } catch (error) {
    console.error("Job failed:", error);

    // Update job status to failed
    try {
      await prisma.discoveryJob.update({
        where: { id: event.jobId },
        data: { status: "failed", completedAt: new Date() },
      });
    } catch (dbError) {
      console.error("Failed to update job status:", dbError);
    }

    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

/**
 * Fetch and extract text content from a URL
 */
async function fetchContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RagBot/1.0; +http://example.com/bot)",
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      console.error(`HTTP ${response.status} for ${url}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/pdf")) {
      // Handle PDF
      const buffer = await response.arrayBuffer();
      const data = await pdfParse(Buffer.from(buffer));
      return data.text;
    } else if (contentType.includes("text/html")) {
      // Handle HTML
      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove scripts, styles, and nav elements
      $("script, style, nav, header, footer, aside").remove();

      // Extract main content
      const mainContent =
        $("main").text() || $("article").text() || $("body").text();

      // Clean up whitespace
      return mainContent.replace(/\s+/g, " ").trim();
    } else {
      // Try plain text
      return await response.text();
    }
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

/**
 * Chunk text into fixed-size pieces with overlap
 */
function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    chunks.push(chunk);

    // Move forward by (chunkSize - overlap) to create overlap
    i += chunkSize - overlap;

    // Prevent infinite loop if overlap >= chunkSize
    if (overlap >= chunkSize) {
      i++;
    }
  }

  return chunks.filter((chunk) => chunk.trim().length > 0);
}

/**
 * Generate embeddings for an array of text chunks
 */
async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  try {
    // OpenAI allows up to 2048 inputs per request
    const batchSize = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: batch,
      });

      const embeddings = response.data.map((item) => item.embedding);
      allEmbeddings.push(...embeddings);

      console.log(
        `Generated embeddings for batch ${i / batchSize + 1} (${batch.length} chunks)`
      );
    }

    return allEmbeddings;
  } catch (error) {
    console.error("Error generating embeddings:", error);
    throw error;
  }
}

/**
 * Utility delay function
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


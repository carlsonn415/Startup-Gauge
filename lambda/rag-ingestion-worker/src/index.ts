import { Handler } from "aws-lambda";
import { PrismaClient } from "@prisma/client";
import { OpenAI } from "openai";
import { extractContent } from "./extractor";
import { chunkText } from "./chunker";
import { generateEmbeddings } from "./embeddings";

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface DiscoveredURL {
  url: string;
  title: string;
  category: "competitor" | "market_report" | "industry_news" | "other";
  relevanceScore: number;
  reason: string;
  snippet?: string;
}

interface LambdaPayload {
  jobId: string;
  projectId: string;
  userId: string;
  urls: DiscoveredURL[];
}

export const handler: Handler = async (event: LambdaPayload) => {
  const { jobId, projectId, userId, urls } = event;

  console.log(`Starting ingestion job ${jobId} with ${urls.length} URLs`);

  try {
    // Update job status to processing
    await prisma.discoveryJob.update({
      where: { id: jobId },
      data: { status: "processing" },
    });

    let totalChunks = 0;

    // Process each URL
    for (const urlData of urls) {
      try {
        console.log(`Processing: ${urlData.url}`);

        // Step 1: Extract content
        const content = await extractContent(urlData.url);
        if (!content || content.length < 100) {
          console.warn(`Skipping ${urlData.url}: insufficient content`);
          continue;
        }

        console.log(`Extracted ${content.length} characters from ${urlData.url}`);

        // Step 2: Chunk the content
        const chunks = chunkText(content, 1000, 200);
        console.log(`Created ${chunks.length} chunks`);

        // Step 3: Generate embeddings in batches
        const batchSize = 100; // OpenAI allows up to 2048 inputs per request
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const embeddings = await generateEmbeddings(openai, batch);

          // Step 4: Store in database using raw SQL for embedding field
          for (let idx = 0; idx < batch.length; idx++) {
            const chunkText = batch[idx];
            const embedding = embeddings[idx];
            
            // Format embedding as pgvector array string
            const embeddingVector = `[${embedding.join(",")}]`;
            
            // Use raw SQL to insert with pgvector embedding
            await prisma.$executeRawUnsafe(
              `INSERT INTO "DocumentChunk" 
               ("id", "projectId", "sourceUrl", "chunkIndex", "content", "embedding", "metadata", "createdAt")
               VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, $6::jsonb, NOW())`,
              projectId,
              urlData.url,
              i + idx,
              chunkText,
              embeddingVector,
              JSON.stringify({
                title: urlData.title,
                category: urlData.category,
                relevanceScore: urlData.relevanceScore,
                reason: urlData.reason,
                snippet: urlData.snippet,
              })
            );
          }

          totalChunks += batch.length;
          console.log(`Stored batch ${Math.floor(i / batchSize) + 1} (${batch.length} chunks)`);
        }

        console.log(`✓ Completed ${urlData.url}: ${chunks.length} chunks`);
      } catch (error) {
        console.error(`Error processing ${urlData.url}:`, error);
        // Continue with next URL even if one fails
      }
    }

    // Update job status to completed
    await prisma.discoveryJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        chunksCount: totalChunks,
        completedAt: new Date(),
      },
    });

    console.log(`✅ Job ${jobId} completed: ${totalChunks} total chunks ingested`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        jobId,
        status: "completed",
        totalChunks,
      }),
    };
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);

    // Update job status to failed
    await prisma.discoveryJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      },
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
};


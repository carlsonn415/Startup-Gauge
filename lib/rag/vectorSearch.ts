import { prisma } from "@/lib/db/prisma";
import { OpenAI } from "openai";

const getClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable not set");
  }
  return new OpenAI({ apiKey });
};

export interface SearchResult {
  content: string;
  sourceUrl: string;
  sourceTitle: string | null;
  category: string | null;
  similarity: number;
  metadata: any;
}

/**
 * Generate embedding for a query text
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  const client = getClient();
  
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
    encoding_format: "float",
  });

  return response.data[0].embedding;
}

/**
 * Perform vector similarity search
 */
export async function searchSimilarChunks(
  projectId: string,
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  // Generate embedding for the query
  const queryEmbedding = await generateQueryEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(",")}]`;

  // Perform vector similarity search using pgvector
  // Using cosine distance (1 - cosine similarity)
  const results = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 
      content,
      "sourceUrl",
      metadata,
      1 - (embedding <=> $1::vector) as similarity
    FROM "DocumentChunk"
    WHERE "projectId" = $2
      AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $3
  `, embeddingString, projectId, topK);

  return results.map((r) => ({
    content: r.content,
    sourceUrl: r.sourceUrl,
    sourceTitle: r.metadata?.title || null,
    category: r.metadata?.category || null,
    similarity: parseFloat(r.similarity),
    metadata: r.metadata,
  }));
}

/**
 * Check if a project has any ingested documents
 */
export async function hasIngestedDocuments(projectId: string): Promise<boolean> {
  const count = await prisma.documentChunk.count({
    where: { projectId },
  });
  return count > 0;
}

/**
 * Get ingestion status for a project
 */
export async function getIngestionStatus(projectId: string) {
  const job = await prisma.discoveryJob.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const chunkCount = await prisma.documentChunk.count({
    where: { projectId },
  });

  return {
    hasJob: !!job,
    status: job?.status || null,
    chunksCount: chunkCount,
    lastJobAt: job?.createdAt || null,
  };
}


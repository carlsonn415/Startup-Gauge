import { OpenAI } from "openai";

/**
 * Generate embeddings for an array of text chunks
 */
export async function generateEmbeddings(
  client: OpenAI,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  try {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
      encoding_format: "float",
    });

    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error("Error generating embeddings:", error);
    throw error;
  }
}


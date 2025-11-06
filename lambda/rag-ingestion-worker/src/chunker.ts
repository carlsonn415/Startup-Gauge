/**
 * Simple token estimation (rough approximation)
 * 1 token ≈ 4 characters for English text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk text into fixed-size pieces with overlap
 */
export function chunkText(
  text: string,
  maxTokens: number = 1000,
  overlapTokens: number = 200
): string[] {
  // Convert tokens to characters (rough approximation)
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = start + maxChars;
    let chunk = text.slice(start, end);

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf(". ");
      const lastNewline = chunk.lastIndexOf("\n");
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > maxChars * 0.5) {
        // Only break if we're past halfway
        chunk = chunk.slice(0, breakPoint + 1);
      }
    }

    chunks.push(chunk.trim());

    // Move start position (with overlap)
    start += chunk.length - overlapChars;

    // Prevent infinite loop
    if (start <= chunks[chunks.length - 2]?.length || chunks.length > 1000) {
      break;
    }
  }

  return chunks.filter((c) => c.length > 50); // Filter out very short chunks
}


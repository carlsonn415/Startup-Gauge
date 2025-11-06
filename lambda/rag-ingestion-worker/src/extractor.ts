import * as cheerio from "cheerio";
import pdfParse from "pdf-parse";

/**
 * Extract text content from a URL (HTML or PDF)
 */
export async function extractContent(url: string): Promise<string> {
  const timeout = 10000; // 10 second timeout

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BizViabilityBot/1.0)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";

    // Handle PDF files
    if (contentType.includes("application/pdf") || url.endsWith(".pdf")) {
      return await extractPdf(response);
    }

    // Handle HTML
    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      return await extractHtml(response);
    }

    // Fallback: try as HTML
    return await extractHtml(response);
  } catch (error) {
    console.error(`Failed to extract content from ${url}:`, error);
    throw error;
  }
}

/**
 * Extract text from HTML using Cheerio
 */
async function extractHtml(response: Response): Promise<string> {
  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove script, style, and nav elements
  $("script, style, nav, header, footer, aside, .advertisement, .ads, #comments").remove();

  // Try to find main content area
  let content = "";
  const mainSelectors = [
    "main",
    "article",
    '[role="main"]',
    ".main-content",
    ".content",
    "#content",
    ".post-content",
    ".article-content",
  ];

  for (const selector of mainSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      content = element.text();
      break;
    }
  }

  // Fallback to body if no main content found
  if (!content) {
    content = $("body").text();
  }

  // Clean up whitespace
  content = content
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .replace(/\n+/g, "\n") // Replace multiple newlines with single newline
    .trim();

  return content;
}

/**
 * Extract text from PDF
 */
async function extractPdf(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();
  const data = await pdfParse(Buffer.from(buffer));
  return data.text;
}


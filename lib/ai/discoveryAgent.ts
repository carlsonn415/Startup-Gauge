import { OpenAI } from "openai";
import { searchBrave, BraveSearchResult } from "@/lib/search/braveSearch";

const getClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable not set");
  }
  return new OpenAI({ apiKey });
};

export interface DiscoveredURL {
  url: string;
  title: string;
  category: "competitor" | "market_report" | "industry_news" | "other";
  relevanceScore: number;
  reason: string;
  snippet?: string;
}

/**
 * Step 1: Use GPT-4 to generate targeted search queries
 */
async function generateSearchQueries(businessIdea: string): Promise<string[]> {
  const client = getClient();

  const prompt = `You are a business research assistant. Given a business idea, generate 5-7 targeted search queries to find:
1. Direct competitors and similar businesses
2. Market research reports and industry analysis
3. Recent industry news and trends

Business idea: "${businessIdea}"

Return ONLY a JSON array of search query strings, nothing else.
Example: ["query 1", "query 2", "query 3"]`;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from GPT-4 for query generation");
  }

  // Handle both array and object formats
  const parsed = JSON.parse(content);
  const queries = Array.isArray(parsed) ? parsed : (parsed.queries || parsed.searchQueries || []);

  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error("Failed to generate search queries");
  }

  return queries;
}

/**
 * Step 2: Search using Brave API for each query
 */
async function searchAllQueries(queries: string[]): Promise<BraveSearchResult[]> {
  const allResults: BraveSearchResult[] = [];
  const resultsPerQuery = 5;

  for (const query of queries) {
    try {
      console.log(`Searching Brave for: "${query}"`);
      const results = await searchBrave(query, resultsPerQuery);
      allResults.push(...results);
      
      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Error searching for "${query}":`, error);
      // Continue with other queries even if one fails
    }
  }

  // Deduplicate by URL
  const uniqueUrls = new Map<string, BraveSearchResult>();
  for (const result of allResults) {
    if (!uniqueUrls.has(result.url)) {
      uniqueUrls.set(result.url, result);
    }
  }

  return Array.from(uniqueUrls.values());
}

/**
 * Step 3: Use GPT-4 to filter and rank the most relevant URLs
 */
async function filterAndRankUrls(
  businessIdea: string,
  searchResults: BraveSearchResult[]
): Promise<DiscoveredURL[]> {
  const client = getClient();

  const resultsText = searchResults
    .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   Description: ${r.description}`)
    .join("\n\n");

  const prompt = `You are a business research expert. Given a business idea and search results, identify the 10-15 MOST relevant URLs for competitive analysis and market research.

Business idea: "${businessIdea}"

Search results:
${resultsText}

For each relevant URL, categorize it and explain its value:
- "competitor": Direct or indirect competitors
- "market_report": Market research, industry reports, statistics
- "industry_news": News articles, trends, announcements
- "other": Other relevant resources

Return a JSON object with a "urls" array. Each item should have:
{
  "url": "full URL",
  "title": "page title",
  "category": "competitor" | "market_report" | "industry_news" | "other",
  "relevanceScore": 0.0-1.0,
  "reason": "brief explanation of relevance",
  "snippet": "key information from description"
}

Focus on quality over quantity. Exclude generic sites, search engines, and low-value pages.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from GPT-4 for URL filtering");
  }

  const parsed = JSON.parse(content);
  const urls: DiscoveredURL[] = parsed.urls || [];

  // Sort by relevance score descending
  urls.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return urls;
}

/**
 * Main Discovery Agent function
 * Takes a business idea and returns a curated list of URLs to ingest
 */
export async function discoverUrls(businessIdea: string): Promise<DiscoveredURL[]> {
  console.log("Step 1: Generating search queries...");
  const queries = await generateSearchQueries(businessIdea);
  console.log(`Generated ${queries.length} queries:`, queries);

  console.log("Step 2: Searching Brave API...");
  const searchResults = await searchAllQueries(queries);
  console.log(`Found ${searchResults.length} unique results`);

  console.log("Step 3: Filtering and ranking URLs...");
  const discoveredUrls = await filterAndRankUrls(businessIdea, searchResults);
  console.log(`Filtered to ${discoveredUrls.length} relevant URLs`);

  return discoveredUrls;
}


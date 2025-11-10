import { NextRequest, NextResponse } from "next/server";
import { verifyAuthHeader } from "@/lib/auth/verifyJwt";
import { BraveSearchClient } from "@/lib/search/braveClient";
import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Schema for discovered URLs
const DiscoveredUrlSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  category: z.enum(["competitor", "market_report", "industry_news"]),
  relevanceScore: z.number().min(0).max(1),
  reason: z.string(),
});

const DiscoveryResponseSchema = z.object({
  urls: z.array(DiscoveredUrlSchema),
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Auth required
    const auth = req.headers.get("authorization") || undefined;
    const payload = await verifyAuthHeader(auth);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { businessIdea } = body;

    if (!businessIdea || typeof businessIdea !== "string") {
      return NextResponse.json(
        { ok: false, error: "businessIdea is required" },
        { status: 400 }
      );
    }

    console.log("Starting discovery for:", businessIdea);

    // Step 1: Generate search queries using GPT-4
    const queryPrompt = `You are a business research assistant. Generate 5-7 targeted search queries to find:
1. Direct competitors
2. Market research reports and industry analysis
3. Relevant industry news and trends

For this business idea: "${businessIdea}"

Return a JSON object with a "queries" array containing the search queries.

Example response format:
{
  "queries": [
    "eco-friendly pet subscription boxes",
    "sustainable pet products market size 2024",
    "best green pet supply companies"
  ]
}`;

    const queryCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: queryPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const queryContent = queryCompletion.choices[0]?.message?.content;
    if (!queryContent) {
      throw new Error("Failed to generate search queries");
    }

    const { queries } = JSON.parse(queryContent) as { queries: string[] };
    console.log("Generated queries:", queries);

    // Step 2: Search using Brave API
    const braveClient = new BraveSearchClient();
    const searchResults = await braveClient.batchSearch(queries, 5);

    // Flatten all results into a single array
    const allResults: Array<{ title: string; url: string; snippet: string }> = [];
    for (const [query, results] of searchResults) {
      for (const result of results) {
        allResults.push({
          title: result.title,
          url: result.url,
          snippet: result.description,
        });
      }
    }

    console.log(`Found ${allResults.length} total results from Brave Search`);

    // Step 3: Use GPT-4 to filter and rank URLs
    const filterPrompt = `You are a business research analyst. Review these search results and identify the 10-15 most relevant URLs for competitive analysis of this business idea: "${businessIdea}"

Search results:
${JSON.stringify(allResults, null, 2)}

For each URL you select, categorize it as:
- "competitor": A direct or indirect competitor
- "market_report": Industry reports, market analysis, research papers
- "industry_news": News articles, trend analysis, thought leadership

Assign a relevance score (0-1) and provide a brief reason for inclusion.

Return a JSON object matching this exact schema:
{
  "urls": [
    {
      "url": "https://example.com",
      "title": "Example Company",
      "category": "competitor",
      "relevanceScore": 0.95,
      "reason": "Direct competitor in the same market"
    }
  ]
}

Only return 10-15 of the most relevant URLs. Prioritize quality over quantity.`;

    const filterCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: filterPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const filterContent = filterCompletion.choices[0]?.message?.content;
    if (!filterContent) {
      throw new Error("Failed to filter search results");
    }

    const discoveryResponse = DiscoveryResponseSchema.parse(JSON.parse(filterContent));
    console.log(`Filtered to ${discoveryResponse.urls.length} relevant URLs`);

    return NextResponse.json({
      ok: true,
      urls: discoveryResponse.urls,
      metadata: {
        queriesGenerated: queries.length,
        totalSearchResults: allResults.length,
        filteredUrls: discoveryResponse.urls.length,
      },
    });
  } catch (err: unknown) {
    console.error("Discovery error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

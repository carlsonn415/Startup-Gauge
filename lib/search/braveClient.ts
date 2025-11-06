/**
 * Brave Search API Client
 * Documentation: https://api.search.brave.com/app/documentation/web-search/get-started
 */

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  page_age?: string;
}

export interface BraveSearchResponse {
  query: {
    original: string;
    show_strict_warning: boolean;
  };
  web?: {
    results: BraveSearchResult[];
  };
}

export class BraveSearchClient {
  private apiKey: string;
  private baseUrl = "https://api.search.brave.com/res/v1/web/search";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.BRAVE_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("BRAVE_API_KEY is required");
    }
  }

  /**
   * Search the web using Brave Search API
   * @param query - The search query
   * @param count - Number of results to return (default: 5)
   * @returns Array of search results
   */
  async search(query: string, count: number = 5): Promise<BraveSearchResult[]> {
    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("count", count.toString());

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
      }

      const data: BraveSearchResponse = await response.json();
      return data.web?.results || [];
    } catch (error) {
      console.error("Brave Search error:", error);
      throw error;
    }
  }

  /**
   * Batch search multiple queries
   * @param queries - Array of search queries
   * @param resultsPerQuery - Number of results per query (default: 5)
   * @returns Map of query to results
   */
  async batchSearch(
    queries: string[],
    resultsPerQuery: number = 5
  ): Promise<Map<string, BraveSearchResult[]>> {
    const results = new Map<string, BraveSearchResult[]>();

    // Execute searches sequentially to respect rate limits
    for (const query of queries) {
      try {
        const searchResults = await this.search(query, resultsPerQuery);
        results.set(query, searchResults);
        
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Failed to search for "${query}":`, error);
        results.set(query, []);
      }
    }

    return results;
  }
}


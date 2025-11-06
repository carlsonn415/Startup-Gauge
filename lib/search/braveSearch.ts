/**
 * Brave Search API client
 * Docs: https://api.search.brave.com/app/documentation/web-search/get-started
 */

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  page_age?: string;
  language?: string;
}

export interface BraveSearchResponse {
  query: {
    original: string;
  };
  web?: {
    results: BraveSearchResult[];
  };
}

export async function searchBrave(
  query: string,
  count: number = 10
): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY environment variable not set");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", count.toString());
  url.searchParams.set("text_decorations", "false");
  url.searchParams.set("search_lang", "en");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Brave Search API error: ${response.status} - ${error}`);
  }

  const data: BraveSearchResponse = await response.json();
  return data.web?.results || [];
}


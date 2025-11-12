"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface DiscoveredUrl {
  url: string;
  title: string;
  category: "competitor" | "market_report" | "industry_news";
  relevanceScore: number;
  reason: string;
}

export default function DiscoveryPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [urls, setUrls] = useState<DiscoveredUrl[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [ingesting, setIngesting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch project details to get the business name and description
  useEffect(() => {
    async function fetchProject() {
      try {
        const { fetchAuthSession } = await import("aws-amplify/auth");
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();

        if (!idToken) {
          router.push("/projects");
          return;
        }

        const res = await fetch(`/api/projects/${projectId}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });

        if (res.ok) {
          const response = await res.json();
          if (response.ok && response.data) {
            const project = response.data;
            // Set business name from title
            setBusinessName(project.title || "");
            // Set business description from description field, or fall back to businessIdea or empty
            setBusinessDescription(project.description || project.businessIdea || "");
          }
        }
      } catch (err) {
        console.error("Failed to fetch project:", err);
      }
    }

    fetchProject();
  }, [projectId, router]);

  // Poll job status
  useEffect(() => {
    if (!jobId || jobStatus === "completed" || jobStatus === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const { fetchAuthSession } = await import("aws-amplify/auth");
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();

        if (!idToken) return;

        const res = await fetch(`/api/discovery/status/${jobId}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          setJobStatus(data.job.status);

          if (data.job.status === "completed") {
            // Analysis complete, user can continue
          } else if (data.job.status === "failed") {
            setError("Analysis failed. Please try again.");
          }
        }
      } catch (err) {
        console.error("Failed to check job status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  async function handleDiscover() {
    if (!businessName.trim()) {
      setError("Business name is required");
      return;
    }

    if (!businessDescription.trim()) {
      setError("Business description is required");
      return;
    }

    setDiscovering(true);
    setError(null);
    try {
      const { fetchAuthSession } = await import("aws-amplify/auth");
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setError("Please sign in to discover URLs");
        setDiscovering(false);
        return;
      }

      // Update project title and description if they've changed
      const updateRes = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          title: businessName.trim(),
          description: businessDescription.trim(),
        }),
      });

      if (!updateRes.ok) {
        console.error("Failed to update project");
      }

      // Discover URLs using business description as the search query
      const res = await fetch("/api/discovery/urls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessIdea: businessDescription }),
      });

      const data = await res.json();

      if (data.ok) {
        setUrls(data.urls);
        // Select all by default
        const allUrls = new Set<string>(data.urls.map((u: DiscoveredUrl) => u.url));
        setSelectedUrls(allUrls);
      } else {
        setError(data.error || "Failed to discover URLs");
      }
    } catch (err: any) {
      console.error("Discovery error:", err);
      setError(err.message);
    } finally {
      setDiscovering(false);
    }
  }

  async function handleAnalyze() {
    if (selectedUrls.size === 0) {
      setError("Please select at least one URL to analyze");
      return;
    }

    setIngesting(true);
    setError(null);
    try {
      const { fetchAuthSession } = await import("aws-amplify/auth");
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setError("Please sign in to analyze URLs");
        setIngesting(false);
        return;
      }

      const selectedUrlObjects = urls.filter((u) => selectedUrls.has(u.url));

      const res = await fetch("/api/discovery/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          projectId,
          urls: selectedUrlObjects,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setJobId(data.jobId);
        setJobStatus(data.status);
      } else {
        setError(data.error || "Failed to start analysis");
      }
    } catch (err: any) {
      console.error("Analysis error:", err);
      setError(err.message);
    } finally {
      setIngesting(false);
    }
  }

  function toggleUrl(url: string) {
    const newSelected = new Set(selectedUrls);
    if (newSelected.has(url)) {
      newSelected.delete(url);
    } else {
      newSelected.add(url);
    }
    setSelectedUrls(newSelected);
  }

  function toggleAllUrls() {
    if (selectedUrls.size === urls.length) {
      // Unselect all
      setSelectedUrls(new Set());
    } else {
      // Select all
      setSelectedUrls(new Set(urls.map((u) => u.url)));
    }
  }

  function getCategoryIcon(category: string) {
    switch (category) {
      case "competitor":
        return "🏢";
      case "market_report":
        return "📊";
      case "industry_news":
        return "📰";
      default:
        return "🔗";
    }
  }

  function getCategoryLabel(category: string) {
    switch (category) {
      case "competitor":
        return "Competitor";
      case "market_report":
        return "Market Report";
      case "industry_news":
        return "Industry News";
      default:
        return category;
    }
  }

  const categorizedUrls = urls.reduce((acc, url) => {
    if (!acc[url.category]) acc[url.category] = [];
    acc[url.category].push(url);
    return acc;
  }, {} as Record<string, DiscoveredUrl[]>);

  return (
    <main className="max-w-4xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Market Research Discovery</h1>
        <p className="text-gray-600 mt-2">
          Find competitors and market research for your business idea
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-red-800">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {urls.length === 0 ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Business Name</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-white"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g., EcoPet Box"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Business Description</label>
            <textarea
              className="w-full border border-gray-300 rounded-md p-3 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-white"
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              placeholder="Describe your business idea in detail. For example: A subscription box service for eco-friendly pet products targeting environmentally conscious pet owners..."
            />
          </div>

          <button
            className="w-full rounded-md bg-primary-600 px-4 py-3 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-md hover:shadow-lg"
            onClick={handleDiscover}
            disabled={discovering || !businessName.trim() || !businessDescription.trim()}
          >
            {discovering ? "Discovering..." : "Discover Resources"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm text-blue-900">
              📊 Discovered {urls.length} relevant sources. Select the ones you want to
              analyze, then click "Analyze Selected URLs".
            </p>
          </div>

          {Object.entries(categorizedUrls).map(([category, categoryUrls]) => (
            <div key={category} className="space-y-3">
              <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-800">
                {getCategoryIcon(category)}
                {getCategoryLabel(category)} ({categoryUrls.length})
              </h2>

              <div className="space-y-2">
                {categoryUrls.map((url) => (
                  <div
                    key={url.url}
                    className="border border-gray-200 rounded-lg p-4 bg-white shadow-soft hover:shadow-lg transition-all cursor-pointer"
                    onClick={() => toggleUrl(url.url)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedUrls.has(url.url)}
                        onChange={() => toggleUrl(url.url)}
                        className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate mb-1 text-slate-800">
                          {url.title}
                        </h3>
                        <a 
                          href={url.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-primary-600 truncate hover:text-primary-700 hover:underline block mb-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {url.url}
                        </a>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{url.reason}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-gray-500">
                            Relevance: {Math.round(url.relevanceScore * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-3">
            <button
              className="rounded-md border border-gray-300 px-4 py-3 bg-white hover:bg-gray-50 text-sm shadow-soft hover:shadow-md transition-all"
              onClick={toggleAllUrls}
            >
              {selectedUrls.size === urls.length ? "Unselect All" : "Select All"}
            </button>
          </div>

          <div className="flex gap-3">
            <button
              className="flex-1 rounded-md bg-primary-600 px-4 py-3 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-md hover:shadow-lg"
              onClick={handleAnalyze}
              disabled={ingesting || selectedUrls.size === 0}
            >
              {ingesting
                ? "Analyzing selected resources... This may take a few minutes."
                : jobStatus === "processing"
                ? "Analyzing selected resources... This may take a few minutes."
                : `Analyze Selected URLs (${selectedUrls.size})`}
            </button>

            <button
              className="rounded-md border border-gray-300 px-4 py-3 bg-white hover:bg-gray-50 shadow-soft hover:shadow-md transition-all"
              onClick={() => {
                setUrls([]);
                setSelectedUrls(new Set());
              }}
            >
              Start Over
            </button>
          </div>

          {jobStatus && jobStatus === "failed" && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-900">
                Analysis failed. Please try again.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

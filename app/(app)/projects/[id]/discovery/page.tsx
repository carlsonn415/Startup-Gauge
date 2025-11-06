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

  const [businessIdea, setBusinessIdea] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [urls, setUrls] = useState<DiscoveredUrl[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [ingesting, setIngesting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  // Fetch project details to get the business idea
  useEffect(() => {
    async function fetchProject() {
      try {
        const { fetchAuthSession } = await import("aws-amplify/auth");
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();

        if (!idToken) {
          router.push("/");
          return;
        }

        const res = await fetch(`/api/projects/${projectId}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          setBusinessIdea(data.project?.businessIdea || "");
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
            alert(`Ingestion complete! ${data.job.chunksCount} chunks indexed.`);
          } else if (data.job.status === "failed") {
            alert("Ingestion failed. Please try again.");
          }
        }
      } catch (err) {
        console.error("Failed to check job status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  async function handleDiscover() {
    if (!businessIdea.trim()) {
      alert("Business idea is required");
      return;
    }

    setDiscovering(true);
    try {
      const { fetchAuthSession } = await import("aws-amplify/auth");
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        alert("Please sign in to discover URLs");
        setDiscovering(false);
        return;
      }

      const res = await fetch("/api/discovery/urls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessIdea }),
      });

      const data = await res.json();

      if (data.ok) {
        setUrls(data.urls);
        // Select all by default
        const allUrls = new Set(data.urls.map((u: DiscoveredUrl) => u.url));
        setSelectedUrls(allUrls);
      } else {
        alert(data.error || "Failed to discover URLs");
      }
    } catch (err: any) {
      console.error("Discovery error:", err);
      alert(err.message);
    } finally {
      setDiscovering(false);
    }
  }

  async function handleIngest() {
    if (selectedUrls.size === 0) {
      alert("Please select at least one URL to ingest");
      return;
    }

    setIngesting(true);
    try {
      const { fetchAuthSession } = await import("aws-amplify/auth");
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        alert("Please sign in to ingest URLs");
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
        alert(`Ingestion started! Job ID: ${data.jobId}`);
      } else {
        alert(data.error || "Failed to start ingestion");
      }
    } catch (err: any) {
      console.error("Ingestion error:", err);
      alert(err.message);
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

      {urls.length === 0 ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Business Idea</label>
            <textarea
              className="w-full border rounded-md p-3 min-h-[100px]"
              value={businessIdea}
              onChange={(e) => setBusinessIdea(e.target.value)}
              placeholder="e.g., A subscription box service for eco-friendly pet products"
            />
          </div>

          <button
            className="w-full rounded-md bg-black px-4 py-3 text-white hover:opacity-90 disabled:opacity-50"
            onClick={handleDiscover}
            disabled={discovering || !businessIdea.trim()}
          >
            {discovering ? "Discovering..." : "Discover Resources"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm text-blue-900">
              📊 Discovered {urls.length} relevant sources. Select the ones you want to
              analyze, then click "Ingest Selected URLs".
            </p>
          </div>

          {Object.entries(categorizedUrls).map(([category, categoryUrls]) => (
            <div key={category} className="space-y-3">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {getCategoryIcon(category)}
                {getCategoryLabel(category)} ({categoryUrls.length})
              </h2>

              <div className="space-y-2">
                {categoryUrls.map((url) => (
                  <div
                    key={url.url}
                    className="border rounded-md p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleUrl(url.url)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedUrls.has(url.url)}
                        onChange={() => toggleUrl(url.url)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{url.title}</h3>
                        <p className="text-xs text-blue-600 truncate">{url.url}</p>
                        <p className="text-xs text-gray-600 mt-1">{url.reason}</p>
                        <span className="text-xs text-gray-500">
                          Relevance: {Math.round(url.relevanceScore * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-3">
            <button
              className="flex-1 rounded-md bg-black px-4 py-3 text-white hover:opacity-90 disabled:opacity-50"
              onClick={handleIngest}
              disabled={ingesting || selectedUrls.size === 0}
            >
              {ingesting
                ? "Starting Ingestion..."
                : `Ingest Selected URLs (${selectedUrls.size})`}
            </button>

            <button
              className="rounded-md border border-gray-300 px-4 py-3 hover:bg-gray-50"
              onClick={() => {
                setUrls([]);
                setSelectedUrls(new Set());
              }}
            >
              Start Over
            </button>
          </div>

          {jobStatus && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-sm text-yellow-900">
                Job Status: <strong>{jobStatus}</strong>
                {jobStatus === "processing" && " (polling for updates...)"}
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

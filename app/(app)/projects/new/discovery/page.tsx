"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, fetchAuthSession, signInWithRedirect } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

interface DiscoveredUrl {
  url: string;
  title: string;
  category: "competitor" | "market_report" | "industry_news";
  relevanceScore: number;
  reason: string;
}

export default function NewProjectDiscoveryPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [businessIdea, setBusinessIdea] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [urls, setUrls] = useState<DiscoveredUrl[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setCheckingAuth(false);
      } catch {
        // User is not authenticated, redirect to sign in
        await signInWithRedirect();
      }
    })();
  }, [router]);

  // Poll analysis status
  useEffect(() => {
    if (!jobId || analysisStatus === "completed" || analysisStatus === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();

        if (!idToken) return;

        const res = await fetch(`/api/discovery/status/${jobId}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          setAnalysisStatus(data.job.status);

          if (data.job.status === "completed") {
            // Navigate to details page after analysis completes
            if (projectId) {
              router.push(`/projects/${projectId}/details`);
            }
          } else if (data.job.status === "failed") {
            alert("Analysis failed. Please try again.");
          }
        }
      } catch (err) {
        console.error("Failed to check analysis status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, analysisStatus, projectId, router]);

  async function handleDiscover() {
    if (!businessIdea.trim()) {
      alert("Business idea is required");
      return;
    }

    setDiscovering(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        alert("Please sign in");
        setDiscovering(false);
        return;
      }

      // Create project first
      if (!projectId) {
        const createRes = await fetch("/api/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            title: businessIdea.slice(0, 60),
            description: businessIdea,
          }),
        });

        const createData = await createRes.json();
        if (createData.ok) {
          setProjectId(createData.data.id);
        } else {
          throw new Error(createData.error || "Failed to create project");
        }
      }

      // Discover URLs
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
        const allUrls = new Set<string>(data.urls.map((u: DiscoveredUrl) => u.url));
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

  async function handleAnalyze() {
    if (!projectId) {
      alert("Project not created. Please discover URLs first.");
      return;
    }

    if (selectedUrls.size === 0) {
      alert("Please select at least one URL to analyze");
      return;
    }

    setAnalyzing(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        alert("Please sign in");
        setAnalyzing(false);
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
        setAnalysisStatus(data.status);
      } else {
        alert(data.error || "Failed to start analysis");
      }
    } catch (err: any) {
      console.error("Analysis error:", err);
      alert(err.message);
    } finally {
      setAnalyzing(false);
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

  if (checkingAuth) {
    return (
      <main className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Step 1: Market Research Discovery</h1>
        <p className="text-gray-600 mt-2">
          Enter your business idea and discover relevant resources to analyze
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
              analyze, then click "Analyze Selected URLs" to continue.
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
                        <a 
                          href={url.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 truncate hover:underline block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {url.url}
                        </a>
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
              onClick={handleAnalyze}
              disabled={analyzing || selectedUrls.size === 0 || analysisStatus === "processing"}
            >
              {analyzing
                ? "Starting Analysis..."
                : analysisStatus === "processing"
                ? "Analyzing Resources..."
                : `Analyze Selected URLs (${selectedUrls.size})`}
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

          {analysisStatus && analysisStatus !== "completed" && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-sm text-yellow-900">
                {analysisStatus === "processing" && "Analyzing selected resources... This may take a few minutes."}
                {analysisStatus === "pending" && "Analysis queued. Starting soon..."}
                {analysisStatus === "failed" && "Analysis failed. Please try again."}
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}


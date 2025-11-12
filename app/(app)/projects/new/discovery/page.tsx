"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, fetchAuthSession, signInWithRedirect } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";
import { setRedirectDestination, getAndClearRedirectDestination } from "@/lib/auth/redirectHelpers";

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
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [urls, setUrls] = useState<DiscoveredUrl[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        
        // Check for redirect destination after sign-in (shouldn't happen here, but handle it)
        const redirectPath = getAndClearRedirectDestination();
        if (redirectPath && redirectPath !== "/projects/new/discovery") {
          router.push(redirectPath);
          return;
        }
        
        // Check usage limits before allowing new project
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        
        if (!idToken) {
          setRedirectDestination("/projects/new/discovery");
          await signInWithRedirect();
          return;
        }
        
        const usageRes = await fetch("/api/user/usage", {
          headers: { authorization: `Bearer ${idToken}` },
        });
        
        if (!usageRes.ok) {
          console.error("Failed to check usage:", usageRes.status);
          setCheckingAuth(false);
          return;
        }
        
        const usageData = await usageRes.json();
        console.log("Usage check result:", usageData);
        
        if (usageData.ok && usageData.data) {
          // If no remaining analyses, redirect to pricing page
          if (usageData.data.remaining <= 0) {
            console.log("User out of credits, redirecting to pricing");
            router.push("/pricing?outOfCredits=true");
            return;
          }
        }
        
        setCheckingAuth(false);
      } catch (err) {
        console.error("Error checking usage:", err);
        // User is not authenticated, redirect to sign in
        setRedirectDestination("/projects/new/discovery");
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
            setError("Analysis failed. Please try again.");
          }
        }
      } catch (err) {
        console.error("Failed to check analysis status:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, analysisStatus, projectId, router]);

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
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setError("Please sign in");
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
            title: businessName.trim(),
            description: businessDescription.trim(),
          }),
        });

        const createData = await createRes.json();
        if (createData.ok) {
          setProjectId(createData.data.id);
        } else {
          throw new Error(createData.error || "Failed to create project");
        }
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
    if (!projectId) {
      setError("Project not created. Please discover URLs first.");
      return;
    }

    if (selectedUrls.size === 0) {
      setError("Please select at least one URL to analyze");
      return;
    }

    setAnalyzing(true);
    setError(null);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setError("Please sign in");
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
        setError(data.error || "Failed to start analysis");
      }
    } catch (err: any) {
      console.error("Analysis error:", err);
      setError(err.message);
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
              className="w-full border rounded-md p-3"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g., EcoPet Box"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Business Description</label>
            <textarea
              className="w-full border rounded-md p-3 min-h-[100px]"
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              placeholder="Describe your business idea in detail. For example: A subscription box service for eco-friendly pet products targeting environmentally conscious pet owners..."
            />
          </div>

          <button
            className="w-full rounded-md bg-black px-4 py-3 text-white hover:opacity-90 disabled:opacity-50"
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
              className="rounded-md border border-gray-300 px-4 py-3 hover:bg-gray-50 text-sm"
              onClick={toggleAllUrls}
            >
              {selectedUrls.size === urls.length ? "Unselect All" : "Select All"}
            </button>
          </div>

          <div className="flex gap-3">
            <button
              className="flex-1 rounded-md bg-black px-4 py-3 text-white hover:opacity-90 disabled:opacity-50"
              onClick={handleAnalyze}
              disabled={analyzing || selectedUrls.size === 0 || analysisStatus === "processing"}
            >
              {analyzing
                ? "Analyzing selected resources... This may take a few minutes."
                : analysisStatus === "processing"
                ? "Analyzing selected resources... This may take a few minutes."
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

          {analysisStatus && analysisStatus === "failed" && (
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


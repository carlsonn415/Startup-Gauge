"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [idea, setIdea] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setCheckingAuth(false);
        
        // Fetch project details
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        
        if (!idToken) {
          console.error("No ID token found - redirecting to home");
          router.push("/");
          return;
        }
        
        try {
          const res = await fetch(`/api/projects/${projectId}`, {
            headers: { authorization: `Bearer ${idToken}` },
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.ok && data.data) {
              setProject(data.data);
              setIdea(data.data.businessIdea || data.data.title || "");
              setError(null);
            } else {
              console.error("Invalid response format:", data);
              setError("Failed to load project data. Please try again.");
            }
          } else {
            // Handle different error status codes
            if (res.status === 401) {
              console.error("Unauthorized - redirecting to home");
              router.push("/");
              return;
            } else if (res.status === 404) {
              console.error("Project not found - redirecting to home");
              router.push("/");
              return;
            } else {
              const errorData = await res.json().catch(() => ({}));
              console.error("Failed to fetch project:", res.status, errorData);
              setError(`Failed to load project (${res.status}). Please try again.`);
            }
          }
        } catch (fetchError) {
          console.error("Fetch error:", fetchError);
          setError("Network error. Please check your connection and try again.");
        }
      } catch (authError) {
        console.error("Authentication error:", authError);
        // Only redirect on authentication errors
        router.push("/");
      }
    })();
  }, [projectId, router]);

  async function analyze() {
    if (!idea.trim() || !targetMarket.trim()) {
      setFormError("Idea and target market are required");
      return;
    }

    setLoading(true);
    setResult(null);
    setFormError(null);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setFormError("Please sign in");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/viability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          idea,
          targetMarket,
          budgetUsd: Number(budget || 0),
          timelineMonths: Number(timeline || 6),
          projectId, // Use existing project for RAG context
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      
      setResult(data.data);
      
      // Navigate to report page
      router.push(`/projects/${projectId}/report`);
    } catch (e: any) {
      setFormError(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

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
    <main className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Step 2: Enter Details</h1>
        <p className="text-gray-600 mt-2">
          Provide additional details about your business idea to generate a comprehensive viability report
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-900">{error}</p>
          <button
            onClick={() => {
              setError(null);
              // Retry loading the project
              window.location.reload();
            }}
            className="mt-2 text-sm text-red-700 underline"
          >
            Retry
          </button>
        </div>
      )}

      {formError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-red-800">{formError}</p>
            <button
              onClick={() => setFormError(null)}
              className="text-red-600 hover:text-red-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <form className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Business Idea</label>
          <textarea
            className="w-full rounded-md border p-3 min-h-[100px]"
            rows={4}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Describe your business idea..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Target Market</label>
          <input
            className="w-full rounded-md border p-3"
            value={targetMarket}
            onChange={(e) => setTargetMarket(e.target.value)}
            placeholder="e.g., Pet owners aged 25-45 interested in sustainability"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-2">Budget (USD)</label>
            <input
              type="number"
              className="w-full rounded-md border p-3"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="50000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Timeline (months)</label>
            <input
              type="number"
              className="w-full rounded-md border p-3"
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              placeholder="12"
            />
          </div>
        </div>

        <button
          type="button"
          className="w-full rounded-md bg-black px-4 py-3 text-white disabled:opacity-50"
          onClick={analyze}
          disabled={loading || !idea.trim() || !targetMarket.trim()}
        >
          {loading ? "Analyzing..." : "Generate Viability Report"}
        </button>
      </form>
    </main>
  );
}


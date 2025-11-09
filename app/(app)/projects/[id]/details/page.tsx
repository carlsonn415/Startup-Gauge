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

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setCheckingAuth(false);
        
        // Fetch project details
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        
        if (idToken) {
          const res = await fetch(`/api/projects/${projectId}`, {
            headers: { authorization: `Bearer ${idToken}` },
          });
          
          if (res.ok) {
            const data = await res.json();
            setProject(data.project);
            setIdea(data.project.businessIdea || "");
          }
        }
      } catch {
        router.push("/");
      }
    })();
  }, [projectId, router]);

  async function analyze() {
    if (!idea.trim() || !targetMarket.trim()) {
      alert("Idea and target market are required");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        alert("Please sign in");
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
      alert(`Error: ${e.message}`);
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


"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

export default function NewProjectPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setCheckingAuth(false);
      } catch {
        // Not authenticated, redirect to home
        router.push("/");
      }
    })();
  }, [router]);

  async function analyze() {
    setLoading(true);
    setResult("");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // Optionally attach Amplify ID token if available
      try {
        const { fetchAuthSession } = await import("aws-amplify/auth");
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        if (idToken) headers["authorization"] = `Bearer ${idToken}`;
      } catch {}

      const res = await fetch("/api/viability", {
        method: "POST",
        headers,
        body: JSON.stringify({
          idea,
          targetMarket,
          budgetUsd: Number(budget || 0),
          timelineMonths: Number(timeline || 6),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setResult(JSON.stringify(data.data, null, 2));
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <main className="space-y-6">
        <p className="text-gray-600">Loading...</p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">New Idea</h1>
      <form className="space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium">Idea</label>
          <textarea
            className="mt-1 w-full rounded-md border p-2"
            rows={4}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Target Market</label>
          <input
            className="mt-1 w-full rounded-md border p-2"
            value={targetMarket}
            onChange={(e) => setTargetMarket(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Budget (USD)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-md border p-2"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Timeline (months)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-md border p-2"
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
          onClick={analyze}
          disabled={loading}
        >
          {loading ? "Analyzing..." : "Analyze Viability"}
        </button>
      </form>

      {result && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold">Result</h2>
          <pre className="mt-2 max-h-[500px] overflow-auto rounded-md border bg-gray-50 p-3 text-sm">
            {result}
          </pre>
        </div>
      )}
    </main>
  );
}


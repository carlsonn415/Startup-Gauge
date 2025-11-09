"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

export default function ProjectReportPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setCheckingAuth(false);
        
        // Fetch project with latest analysis
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
          const response = await res.json();
          if (response.ok && response.data) {
            const project = response.data;
            setProject(project);
            if (project.latestAnalysis?.output) {
              setAnalysis(project.latestAnalysis.output);
            } else {
              // No analysis found, but don't redirect - show the "no analysis" message
              setAnalysis(null);
            }
          } else {
            // API returned error - project not found or unauthorized
            console.error("Failed to fetch project:", response.error);
            if (response.error === "Project not found" || response.error === "Unauthorized") {
              router.push("/");
              return;
            }
            setAnalysis(null);
          }
        } else {
          // HTTP error
          const error = await res.json().catch(() => ({ error: "Failed to fetch project" }));
          console.error("HTTP error:", error);
          if (res.status === 404 || res.status === 401) {
            router.push("/");
            return;
          }
          setAnalysis(null);
        }
      } catch (err) {
        // Auth error or other critical error
        console.error("Error loading report:", err);
        router.push("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, router]);

  if (checkingAuth || loading) {
    return (
      <main className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  if (!analysis) {
    return (
      <main className="max-w-4xl mx-auto space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">No Analysis Found</h1>
          <p className="text-gray-600 mt-2">
            This project doesn't have a viability report yet.
          </p>
          <button
            onClick={() => router.push(`/projects/${projectId}/details`)}
            className="mt-4 rounded-md bg-black px-4 py-2 text-white"
          >
            Generate Report
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{project?.businessIdea || "Viability Report"}</h1>
          <p className="text-gray-600 mt-1">Business Viability Analysis</p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          Back to Projects
        </button>
      </div>

      <div className="space-y-6">
        {/* Summary */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3">Executive Summary</h2>
          <p className="text-gray-700 leading-relaxed">{analysis.summary}</p>
        </section>

        {/* Market Size */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3">Market Size</h2>
          <p className="text-2xl font-bold text-gray-900">
            ${(analysis.marketSizeUsd / 1_000_000_000).toFixed(2)}B
          </p>
          <p className="text-sm text-gray-600 mt-1">Estimated market size</p>
          <p className="text-sm text-gray-500 mt-2">
            This represents the total addressable market (TAM) - the total revenue opportunity available if you captured 100% of the market. It helps you understand the potential scale of your business opportunity.
          </p>
        </section>

        {/* Risks */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3">Key Risks</h2>
          <ul className="space-y-2">
            {analysis.risks.map((risk: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-red-500 mt-1">⚠️</span>
                <span className="text-gray-700">{risk}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Steps */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3">Launch Roadmap</h2>
          <div className="space-y-4">
            {analysis.steps.map((step: any, idx: number) => (
              <div key={idx} className="border-l-4 border-blue-500 pl-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-blue-600">Step {idx + 1}</span>
                  <span className="text-sm text-gray-500">
                    ({step.durationWeeks} weeks)
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900">{step.title}</h3>
                <p className="text-gray-700 mt-1">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Profit Model */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Financial Projections</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600">Customer Acquisition Cost</p>
              <p className="text-lg font-semibold">${analysis.profitModel.cacUsd}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Lifetime Value</p>
              <p className="text-lg font-semibold">${analysis.profitModel.ltvUsd}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Gross Margin</p>
              <p className="text-lg font-semibold">{analysis.profitModel.grossMarginPct}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Break-Even</p>
              <p className="text-lg font-semibold">{analysis.profitModel.breakEvenMonths} months</p>
            </div>
          </div>
          
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">12-Month Projection</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Month</th>
                    <th className="text-right p-2">Revenue</th>
                    <th className="text-right p-2">Costs</th>
                    <th className="text-right p-2">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.profitModel.monthlyProjection.map((month: any) => (
                    <tr key={month.month} className="border-b">
                      <td className="p-2">{month.month}</td>
                      <td className="text-right p-2">${month.revenueUsd.toLocaleString()}</td>
                      <td className="text-right p-2">${month.costUsd.toLocaleString()}</td>
                      <td className="text-right p-2 font-medium">
                        ${(month.revenueUsd - month.costUsd).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Confidence */}
        <section className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-1">Confidence Score</h2>
              <p className="text-sm text-gray-600">Based on market data and analysis</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold text-blue-600">{analysis.confidencePct}%</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}


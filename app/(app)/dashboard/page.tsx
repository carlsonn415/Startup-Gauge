"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

interface Project {
  id: string;
  title: string;
  status: string;
  confidenceScore: number | null;
  createdAt: string;
  updatedAt: string;
  hasAnalysis: boolean;
  hasDocuments: boolean;
}

interface UsageStats {
  consumed: number;
  limit: number;
  remaining: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>("Free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setCheckingAuth(false);

        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();

        if (idToken) {
          // Fetch projects
          const projectsRes = await fetch("/api/projects", {
            headers: { authorization: `Bearer ${idToken}` },
          });

          if (projectsRes.ok) {
            const projectsData = await projectsRes.json();
            if (projectsData.ok) {
              setProjects(projectsData.data || []);
            }
          }

          // Fetch subscription and usage
          const subscriptionRes = await fetch("/api/user/subscription", {
            headers: { authorization: `Bearer ${idToken}` },
          });

          if (subscriptionRes.ok) {
            const subData = await subscriptionRes.json();
            if (subData.ok && subData.plan) {
              setCurrentPlan(subData.plan.name);
            }
          }

          // Fetch usage stats
          const usageRes = await fetch("/api/user/usage", {
            headers: { authorization: `Bearer ${idToken}` },
          });

          if (usageRes.ok) {
            const usageData = await usageRes.json();
            if (usageData.ok && usageData.usage) {
              setUsageStats(usageData.usage);
            }
          }
        }
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (checkingAuth || loading) {
    return (
      <main className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  const completedProjects = projects.filter((p) => p.status === "completed");
  const inProgressProjects = projects.filter((p) => p.status === "in_progress");
  const recentProjects = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 5);

  const avgConfidence = completedProjects.length > 0
    ? completedProjects.reduce((sum, p) => sum + (p.confidenceScore || 0), 0) / completedProjects.length
    : null;

  return (
    <main className="max-w-6xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Overview of your projects and usage</p>
        </div>
        <a
          href="/projects/new/discovery"
          className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
        >
          New Project
        </a>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-soft hover:shadow-lg transition-shadow">
          <p className="text-sm text-gray-600 mb-1">Total Projects</p>
          <p className="text-2xl font-bold text-slate-900">{projects.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-soft hover:shadow-lg transition-shadow">
          <p className="text-sm text-gray-600 mb-1">Completed</p>
          <p className="text-2xl font-bold text-slate-900">{completedProjects.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-soft hover:shadow-lg transition-shadow">
          <p className="text-sm text-gray-600 mb-1">In Progress</p>
          <p className="text-2xl font-bold text-slate-900">{inProgressProjects.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-soft hover:shadow-lg transition-shadow">
          <p className="text-sm text-gray-600 mb-1">Avg Confidence</p>
          <p className="text-2xl font-bold text-slate-900">
            {avgConfidence !== null ? `${Math.round(avgConfidence)}%` : "N/A"}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Usage Stats */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-soft">
          <h2 className="text-xl font-semibold mb-4 text-slate-800">Usage This Month</h2>
          {usageStats ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Analyses Used</span>
                  <span className="text-sm font-medium">
                    {usageStats.consumed} / {usageStats.limit}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min((usageStats.consumed / usageStats.limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <p className="text-sm text-gray-600">
                {usageStats.remaining} analyses remaining this month
              </p>
              <p className="text-sm text-gray-500">Current Plan: <strong>{currentPlan}</strong></p>
              {usageStats.remaining === 0 && (
                <a
                  href="/pricing"
                  className="inline-block mt-2 text-sm text-primary-600 hover:text-primary-700 hover:underline font-medium"
                >
                  Upgrade to get more analyses →
                </a>
              )}
            </div>
          ) : (
            <p className="text-gray-600">Loading usage data...</p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-soft">
          <h2 className="text-xl font-semibold mb-4 text-slate-800">Quick Actions</h2>
          <div className="space-y-3">
            <a
              href="/projects/new/discovery"
              className="block w-full rounded-md bg-primary-600 px-4 py-2 text-white text-center hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
            >
              Start New Project
            </a>
            <a
              href="/pricing"
              className="block w-full rounded-md border border-gray-300 px-4 py-2 text-center hover:bg-gray-50 transition-colors"
            >
              Upgrade Plan
            </a>
            {recentProjects.length > 0 && (
              <a
                href={`/projects/${recentProjects[0].id}/${recentProjects[0].status === "completed" ? "report" : "details"}`}
                className="block w-full rounded-md border border-gray-300 px-4 py-2 text-center hover:bg-gray-50 transition-colors"
              >
                Continue Latest Project
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Recent Projects */}
      {recentProjects.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-800">Recent Projects</h2>
            <a href="/" className="text-sm text-primary-600 hover:text-primary-700 hover:underline font-medium">
              View All →
            </a>
          </div>
          <div className="space-y-2">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => {
                  if (project.status === "completed" && project.hasAnalysis) {
                    router.push(`/projects/${project.id}/report`);
                  } else if (project.hasDocuments) {
                    router.push(`/projects/${project.id}/details`);
                  } else {
                    router.push(`/projects/${project.id}/discovery`);
                  }
                }}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex-1">
                  <h3 className="font-medium">{project.title}</h3>
                  <p className="text-sm text-gray-600">
                    {project.status === "completed"
                      ? `Confidence: ${project.confidenceScore !== null ? `${project.confidenceScore}%` : "N/A"}`
                      : "In Progress"}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    project.status === "completed"
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {project.status === "completed" ? "Completed" : "In Progress"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}


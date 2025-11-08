"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  hasAnalysis: boolean;
  hasDocuments: boolean;
  latestJobStatus: string | null;
}

export default function HomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showSuccess, setShowSuccess] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setCheckingAuth(false);
        
        // Fetch projects
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        
        if (idToken) {
          const res = await fetch("/api/projects", {
            headers: { authorization: `Bearer ${idToken}` },
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.ok) {
              setProjects(data.data || []);
            }
          }
        }
      } catch {
        // Not authenticated, show public page
        setCheckingAuth(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccess(true);
      window.history.replaceState({}, "", "/");
      setTimeout(() => setShowSuccess(false), 5000);
      
      // Sync subscription from Stripe after successful checkout
      // This is a fallback in case webhooks aren't working
      (async () => {
        try {
          const session = await fetchAuthSession();
          const idToken = session.tokens?.idToken?.toString();
          
          if (idToken) {
            console.log("Syncing subscription from Stripe...");
            const res = await fetch("/api/subscription/sync-from-stripe", {
              method: "POST",
              headers: { authorization: `Bearer ${idToken}` },
            });
            
            if (res.ok) {
              const data = await res.json();
              console.log("Subscription sync result:", data);
              if (data.ok && data.data?.subscription) {
                // Reload to refresh UI with new subscription
                setTimeout(() => {
                  window.location.reload();
                }, 1000);
              }
            } else {
              console.error("Failed to sync subscription:", await res.text());
            }
          }
        } catch (err) {
          console.error("Error syncing subscription:", err);
        }
      })();
    }
  }, [searchParams]);

  function handleProjectClick(project: Project) {
    if (project.status === "completed" && project.hasAnalysis) {
      router.push(`/projects/${project.id}/report`);
    } else {
      // Resume where they left off
      if (project.hasDocuments) {
        // Has ingested documents, go to details page
        router.push(`/projects/${project.id}/details`);
      } else {
        // No documents yet, go to discovery
        router.push(`/projects/${project.id}/discovery`);
      }
    }
  }

  const completedProjects = projects.filter((p) => p.status === "completed");
  const inProgressProjects = projects.filter((p) => p.status === "in_progress");

  return (
    <main className="max-w-4xl mx-auto space-y-6 p-6">
      {showSuccess && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4">
          <p className="text-green-800 font-medium">
            ✓ Subscription successful! Your account has been upgraded.
          </p>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Business Viability Calculator</h1>
          <p className="text-gray-600 mt-2">
            Analyze the viability of your business ideas with AI-powered market research
          </p>
        </div>
        {!checkingAuth && (
          <a
            className="inline-flex items-center rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
            href="/projects/new/discovery"
          >
            New Project
          </a>
        )}
      </div>

      {checkingAuth || loading ? (
        <p className="text-gray-600">Loading...</p>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-gray-600 mb-4">No projects yet.</p>
          <a
            className="inline-flex items-center rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
            href="/projects/new/discovery"
          >
            Start Your First Project
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {inProgressProjects.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-3">In Progress</h2>
              <div className="space-y-2">
                {inProgressProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => handleProjectClick(project)}
                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{project.title}</h3>
                        {project.description && (
                          <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>
                            {project.hasDocuments ? "✓ Resources ingested" : "⏳ Pending resources"}
                          </span>
                          {project.latestJobStatus && (
                            <span>Job: {project.latestJobStatus}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        In Progress
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {completedProjects.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-3">Completed</h2>
              <div className="space-y-2">
                {completedProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => handleProjectClick(project)}
                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium">{project.title}</h3>
                        {project.description && (
                          <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          Completed {new Date(project.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        Completed
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

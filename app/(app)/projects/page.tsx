"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  confidenceScore: number | null;
}

function SearchParamsHandler({ onSuccess }: { onSuccess: () => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      window.history.replaceState({}, "", "/projects");
      onSuccess();
    }
  }, [searchParams, onSuccess]);

  return null;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

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
            } else {
              setError(data.error || "Failed to load projects");
            }
          } else {
            setError("Failed to load projects");
          }
        }
      } catch {
        // Not authenticated, redirect to home
        router.push("/");
        return;
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function handleSuccess() {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 5000);
  }

  function handleProjectClick(project: Project) {
    if (project.status === "completed" && project.hasAnalysis) {
      router.push(`/projects/${project.id}/report`);
    } else if (project.hasDocuments) {
      router.push(`/projects/${project.id}/details`);
    } else {
      router.push(`/projects/${project.id}/discovery`);
    }
  }

  function handleDeleteClick(project: Project) {
    setDeleteConfirm(project);
  }

  function handleCancelDelete() {
    setDeleteConfirm(null);
  }

  async function handleDeleteProject(project: Project) {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      
      if (!idToken) {
        setError("Authentication required");
        return;
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${idToken}` },
      });

      if (res.ok) {
        setProjects(projects.filter((p) => p.id !== project.id));
        setDeleteConfirm(null);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete project");
      }
    } catch (err) {
      setError("An error occurred while deleting the project");
    }
  }

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

  return (
    <main className="max-w-4xl mx-auto space-y-6 p-6">
      <Suspense fallback={null}>
        <SearchParamsHandler onSuccess={handleSuccess} />
      </Suspense>
      {showSuccess && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4">
          <p className="text-green-800 font-medium">
            ✓ Subscription successful! Your account has been upgraded.
          </p>
        </div>
      )}

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

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{deleteConfirm.title}"? This action cannot be undone and all project data will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProject(deleteConfirm)}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xl text-slate-900">
            Analyze the viability of your business ideas with AI-powered market research
          </p>
        </div>
        {projects.length > 0 && (
          <button
            className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
            onClick={() => {
              router.push("/projects/new/discovery");
            }}
          >
            New Project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-gray-600 mb-4">No projects yet.</p>
            <button
              className="inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
              onClick={() => {
                router.push("/projects/new/discovery");
              }}
            >
              Start Your First Project
            </button>
        </div>
      ) : (
        <div className="space-y-6">
          {inProgressProjects.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-3 text-slate-800">In Progress</h2>
              <div className="space-y-2">
                {inProgressProjects.map((project) => (
                  <div
                    key={project.id}
                    className="border border-gray-200 rounded-lg p-4 bg-white shadow-soft hover:shadow-lg transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleProjectClick(project)}
                      >
                        <h3 className="font-medium">{project.title}</h3>
                        {project.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {project.description}
                          </p>
                        )}
                        <p className="text-sm text-gray-500 mt-1">
                          Confidence Score: Not Yet Generated
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>
                            {project.hasDocuments ? "✓ Resources analyzed" : "⏳ Pending resources"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-warning-100 text-warning-800 px-2 py-1 rounded font-medium">
                          In Progress
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(project);
                          }}
                          className="text-red-600 hover:text-red-800 text-sm px-2 py-1 rounded hover:bg-red-50"
                          title="Delete project"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {completedProjects.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-3 text-slate-800">Completed</h2>
              <div className="space-y-2">
                {completedProjects.map((project) => (
                  <div
                    key={project.id}
                    className="border border-gray-200 rounded-lg p-4 bg-white shadow-soft hover:shadow-lg transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleProjectClick(project)}
                      >
                        <h3 className="font-medium">{project.title}</h3>
                        {project.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {project.description}
                          </p>
                        )}
                        <p className="text-sm mt-1">
                          Confidence Score: {project.confidenceScore !== null ? (
                            <span className={project.confidenceScore > 50 ? "text-success-600 font-semibold" : "text-danger-600 font-semibold"}>
                              {project.confidenceScore}%
                            </span>
                          ) : (
                            <span className="text-gray-500">Not Available</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Completed {new Date(project.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-success-100 text-success-700 px-2 py-1 rounded font-medium">
                          Completed
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(project);
                          }}
                          className="text-red-600 hover:text-red-800 text-sm px-2 py-1 rounded hover:bg-red-50"
                          title="Delete project"
                        >
                          🗑️
                        </button>
                      </div>
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

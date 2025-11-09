"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, fetchAuthSession, signInWithRedirect } from "aws-amplify/auth";
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

export default function HomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showSuccess, setShowSuccess] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setIsAuthenticated(true);
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
        setIsAuthenticated(false);
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
        // Has analyzed documents, go to details page
        router.push(`/projects/${project.id}/details`);
      } else {
        // No documents yet, go to discovery
        router.push(`/projects/${project.id}/discovery`);
      }
    }
  }

  async function handleDeleteProject(project: Project) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.title}"? This action cannot be undone and all project data will be permanently deleted.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        alert("Please sign in to delete projects");
        return;
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${idToken}` },
      });

      const data = await res.json();

      if (data.ok) {
        // Remove project from local state
        setProjects(projects.filter((p) => p.id !== project.id));
      } else {
        alert(data.error || "Failed to delete project");
      }
    } catch (err: any) {
      console.error("Delete error:", err);
      alert(`Error: ${err.message}`);
    }
  }

  const completedProjects = projects.filter((p) => p.status === "completed");
  const inProgressProjects = projects.filter((p) => p.status === "in_progress");

  // Show landing page for unauthenticated users
  if (!checkingAuth && !loading && !isAuthenticated) {
    return (
      <main className="space-y-16">
        {showSuccess && (
          <div className="max-w-4xl mx-auto px-6 pt-6">
            <div className="rounded-md bg-green-50 border border-green-200 p-4">
              <p className="text-green-800 font-medium">
                ✓ Subscription successful! Your account has been upgraded.
              </p>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Validate Your Business Ideas
            <br />
            <span className="text-gray-600">with AI-Powered Analysis</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Get comprehensive viability reports with market research, competitor analysis, and financial projections—all powered by advanced AI.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={async () => {
                try {
                  await getCurrentUser();
                  router.push("/projects/new/discovery");
                } catch {
                  await signInWithRedirect();
                }
              }}
              className="inline-flex items-center justify-center rounded-md bg-black px-8 py-3 text-white hover:opacity-90 text-lg font-medium"
            >
              Get Started for Free
            </button>
            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-8 py-3 hover:bg-gray-50 text-lg font-medium"
            >
              View Pricing
            </a>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-bold text-center mb-12">Everything You Need to Validate Your Idea</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold mb-2">Market Research</h3>
              <p className="text-gray-600">
                Automatically discover competitors, market reports, and industry insights relevant to your business idea.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Viability Analysis</h3>
              <p className="text-gray-600">
                Get comprehensive reports with market size, risks, launch roadmap, and financial projections.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-semibold mb-2">AI-Powered Insights</h3>
              <p className="text-gray-600">
                Leverage GPT-4 and RAG technology to get data-driven recommendations tailored to your idea.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="bg-gray-50 py-16">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-lg">
                <div className="text-2xl font-bold text-blue-600 mb-2">1</div>
                <h3 className="text-xl font-semibold mb-3">Discover Resources</h3>
                <p className="text-gray-600">
                  Enter your business idea and we'll automatically find relevant competitors, market reports, and industry news.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg">
                <div className="text-2xl font-bold text-blue-600 mb-2">2</div>
                <h3 className="text-xl font-semibold mb-3">Analyze & Process</h3>
                <p className="text-gray-600">
                  Select the resources you want to analyze. Our AI processes them to extract key insights and data.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg">
                <div className="text-2xl font-bold text-blue-600 mb-2">3</div>
                <h3 className="text-xl font-semibold mb-3">Get Your Report</h3>
                <p className="text-gray-600">
                  Receive a comprehensive viability report with market size, risks, roadmap, and financial projections.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Preview */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-bold text-center mb-4">Simple, Transparent Pricing</h2>
          <p className="text-center text-gray-600 mb-12">Start free, upgrade when you need more</p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="border rounded-lg p-6 flex flex-col">
              <h3 className="text-xl font-semibold mb-2">Free</h3>
              <div className="text-3xl font-bold mb-4">$0<span className="text-lg text-gray-600">/month</span></div>
              <ul className="space-y-2 mb-6 flex-grow">
                <li className="text-sm text-gray-600">✓ 3 analyses per month</li>
                <li className="text-sm text-gray-600">✓ Basic reports</li>
                <li className="text-sm text-gray-600">✓ Email support</li>
              </ul>
              <button
                onClick={async () => {
                  try {
                    await getCurrentUser();
                    router.push("/projects/new/discovery");
                  } catch {
                    await signInWithRedirect();
                  }
                }}
                className="w-full rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
              >
                Get Started
              </button>
            </div>
            <div className="border-2 border-black rounded-lg p-6 relative flex flex-col">
              <div className="absolute top-0 right-0 bg-black text-white text-xs px-2 py-1 rounded-bl">Popular</div>
              <h3 className="text-xl font-semibold mb-2">Starter</h3>
              <div className="text-3xl font-bold mb-4">$29<span className="text-lg text-gray-600">/month</span></div>
              <ul className="space-y-2 mb-6 flex-grow">
                <li className="text-sm text-gray-600">✓ 25 analyses per month</li>
                <li className="text-sm text-gray-600">✓ Detailed reports</li>
                <li className="text-sm text-gray-600">✓ Priority support</li>
                <li className="text-sm text-gray-600">✓ Export to PDF</li>
              </ul>
              <button
                onClick={async () => {
                  try {
                    await getCurrentUser();
                    router.push("/pricing");
                  } catch {
                    await signInWithRedirect();
                  }
                }}
                className="w-full rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
              >
                Upgrade Now
              </button>
            </div>
            <div className="border rounded-lg p-6 flex flex-col">
              <h3 className="text-xl font-semibold mb-2">Pro</h3>
              <div className="text-3xl font-bold mb-4">$99<span className="text-lg text-gray-600">/month</span></div>
              <ul className="space-y-2 mb-6 flex-grow">
                <li className="text-sm text-gray-600">✓ 100 analyses per month</li>
                <li className="text-sm text-gray-600">✓ Advanced reports</li>
                <li className="text-sm text-gray-600">✓ RAG document uploads</li>
                <li className="text-sm text-gray-600">✓ API access</li>
              </ul>
              <button
                onClick={async () => {
                  try {
                    await getCurrentUser();
                    router.push("/pricing");
                  } catch {
                    await signInWithRedirect();
                  }
                }}
                className="w-full rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
              >
                Learn More
              </button>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-black text-white py-16">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Validate Your Idea?</h2>
            <p className="text-xl text-gray-300 mb-8">
              Join entrepreneurs who use AI-powered analysis to make data-driven decisions.
            </p>
            <button
              onClick={async () => {
                try {
                  await getCurrentUser();
                  router.push("/projects/new/discovery");
                } catch {
                  await signInWithRedirect();
                }
              }}
              className="inline-flex items-center rounded-md bg-white px-8 py-3 text-black hover:opacity-90 text-lg font-medium"
            >
              Start Your First Project
            </button>
          </div>
        </section>
      </main>
    );
  }

  // Show project list for authenticated users
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
        {!checkingAuth && !loading && isAuthenticated && projects.length > 0 && (
          <button
            className="inline-flex items-center rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
            onClick={() => {
              router.push("/projects/new/discovery");
            }}
          >
            New Project
          </button>
        )}
      </div>

      {checkingAuth || loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-gray-600 mb-4">No projects yet.</p>
          <button
            className="inline-flex items-center rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
            onClick={async () => {
              try {
                await getCurrentUser();
                // User is authenticated, navigate to new project
                router.push("/projects/new/discovery");
              } catch {
                // User is not authenticated, redirect to sign in
                await signInWithRedirect();
              }
            }}
          >
            Start Your First Project
          </button>
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
                    className="border rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleProjectClick(project)}
                      >
                        <h3 className="font-medium">{project.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Confidence Score: Not Yet Generated
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>
                            {project.hasDocuments ? "✓ Resources analyzed" : "⏳ Pending resources"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                          In Progress
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project);
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
              <h2 className="text-xl font-semibold mb-3">Completed</h2>
              <div className="space-y-2">
                {completedProjects.map((project) => (
                  <div
                    key={project.id}
                    className="border rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleProjectClick(project)}
                      >
                        <h3 className="font-medium">{project.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Confidence Score: {project.confidenceScore !== null ? `${project.confidenceScore}%` : "Not Available"}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Completed {new Date(project.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Completed
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project);
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

"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import { getCurrentUser, fetchAuthSession, signInWithRedirect } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";
import { getAndClearRedirectDestination, setRedirectDestination } from "@/lib/auth/redirectHelpers";


function SearchParamsHandler({ onSuccess }: { onSuccess: () => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      window.history.replaceState({}, "", "/");
      onSuccess();
      
      // Sync subscription from Stripe after successful checkout
      // This is a fallback in case webhooks aren't working
      // Note: We don't reload the page - the banner will show and disappear automatically
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
              // Dispatch event to refresh subscription info in AuthButtons
              window.dispatchEvent(new CustomEvent('subscription-updated'));
            } else {
              console.error("Failed to sync subscription:", await res.text());
            }
          }
        } catch (err) {
          console.error("Error syncing subscription:", err);
        }
      })();
    }
  }, [searchParams, onSuccess]);

  return null;
}

export default function HomePage() {
  const router = useRouter();
  const [showSuccess, setShowSuccess] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setIsAuthenticated(true);
        setCheckingAuth(false);
        
        // Check for redirect destination after sign-in
        const redirectPath = getAndClearRedirectDestination();
        if (redirectPath) {
          router.push(redirectPath);
          return;
        }
      } catch {
        // Not authenticated, show public page
        setIsAuthenticated(false);
        setCheckingAuth(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleSuccess = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 5000);
  };

  // Always show landing page (hero screen)
  if (!checkingAuth && !loading) {
    return (
      <main className="space-y-8">
        <Suspense fallback={null}>
          <SearchParamsHandler onSuccess={handleSuccess} />
        </Suspense>
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
        <section className="max-w-6xl mx-auto px-6 py-12 mb-24">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 text-slate-900 text-left">
                Validate Your Business Ideas
                <br />
                <span className="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">with AI-Powered Analysis</span>
              </h1>
              <p className="text-xl text-gray-600 mb-10 leading-relaxed text-left">
                Get comprehensive viability reports with market research, competitor analysis, and financial projections—all powered by advanced AI.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={async () => {
                    if (isAuthenticated) {
                      router.push("/projects");
                    } else {
                      try {
                        await getCurrentUser();
                        router.push("/projects");
                      } catch {
                        setRedirectDestination("/projects");
                        await signInWithRedirect();
                      }
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-md bg-primary-600 px-8 py-3 text-white hover:bg-primary-700 transition-colors text-lg font-medium shadow-lg hover:shadow-xl"
                >
                  {isAuthenticated ? "Go to Projects" : "Get Started for Free"}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await getCurrentUser();
                      router.push("/pricing");
                    } catch {
                      setRedirectDestination("/pricing");
                      await signInWithRedirect();
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-md border-2 border-primary-600 px-8 py-3 text-primary-700 hover:bg-primary-50 text-lg font-medium transition-colors"
                >
                  View Pricing
                </button>
              </div>
            </div>
            <div className="flex justify-center md:justify-end">
              <Image 
                src="/images/business_lightbulb.png" 
                alt="Business idea validation" 
                width={500}
                height={500}
                className="max-w-full h-auto"
              />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-6xl mx-auto px-6 py-12">
          <h2 className="text-3xl font-bold text-center mb-12 text-slate-900">Everything You Need to Validate Your Idea</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-white rounded-lg border border-gray-200 shadow-soft hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold mb-2 text-slate-800">Market Research</h3>
              <p className="text-gray-600">
                Automatically discover competitors, market reports, and industry insights relevant to your business idea.
              </p>
            </div>
            <div className="text-center p-6 bg-white rounded-lg border border-gray-200 shadow-soft hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2 text-slate-800">Viability Analysis</h3>
              <p className="text-gray-600">
                Get comprehensive reports with market size, risks, launch roadmap, and financial projections.
              </p>
            </div>
            <div className="text-center p-6 bg-white rounded-lg border border-gray-200 shadow-soft hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-semibold mb-2 text-slate-800">AI-Powered Insights</h3>
              <p className="text-gray-600">
                Leverage GPT-4 and RAG technology to get data-driven recommendations tailored to your idea.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-12">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-center mb-12 text-slate-900">How It Works</h2>
            <div className="bg-white rounded-lg border border-gray-200 shadow-soft overflow-hidden">
              <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                <div className="p-6">
                  <div className="text-2xl font-bold text-primary-600 mb-2">1</div>
                  <h3 className="text-xl font-semibold mb-3 text-slate-800">Discover Resources</h3>
                  <p className="text-gray-600">
                    Enter your business idea and we'll automatically find relevant competitors, market reports, and industry news.
                  </p>
                </div>
                <div className="p-6">
                  <div className="text-2xl font-bold text-primary-600 mb-2">2</div>
                  <h3 className="text-xl font-semibold mb-3 text-slate-800">Analyze & Process</h3>
                  <p className="text-gray-600">
                    Select the resources you want to analyze. Our AI processes them to extract key insights and data.
                  </p>
                </div>
                <div className="p-6">
                  <div className="text-2xl font-bold text-primary-600 mb-2">3</div>
                  <h3 className="text-xl font-semibold mb-3 text-slate-800">Get Your Report</h3>
                  <p className="text-gray-600">
                    Receive a comprehensive viability report with market size, risks, roadmap, and financial projections.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Preview */}
        <section className="max-w-6xl mx-auto px-6 py-12">
          <h2 className="text-3xl font-bold text-center mb-4 text-slate-900">Simple, Transparent Pricing</h2>
          <p className="text-center text-slate-800 mb-12">Start free, upgrade when you need more</p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="border border-gray-200 rounded-lg p-6 flex flex-col bg-white shadow-soft hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-semibold mb-2 text-slate-800">Free</h3>
              <div className="text-3xl font-bold mb-4 text-slate-900">$0<span className="text-lg text-gray-500">/month</span></div>
              <ul className="space-y-2 mb-6 flex-grow">
                <li className="text-sm text-gray-600">✓ 3 analyses per month</li>
                <li className="text-sm text-gray-600">✓ Full viability reports</li>
                <li className="text-sm text-gray-600">✓ Email support</li>
              </ul>
              <button
                onClick={async () => {
                  try {
                    await getCurrentUser();
                    router.push("/projects/new/discovery");
                  } catch {
                    setRedirectDestination("/projects/new/discovery");
                    await signInWithRedirect();
                  }
                }}
                className="w-full rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
              >
                Get Started
              </button>
            </div>
            <div className="border-2 border-primary-600 rounded-lg p-6 relative flex flex-col bg-white shadow-soft hover:shadow-glow transition-shadow">
              <div className="absolute top-0 right-0 bg-primary-600 text-white text-xs px-3 py-1 rounded-bl-lg font-semibold">Popular</div>
              <h3 className="text-xl font-semibold mb-2 text-slate-800">Starter</h3>
              <div className="text-3xl font-bold mb-4 text-slate-900">$5<span className="text-lg text-gray-500">/month</span></div>
              <ul className="space-y-2 mb-6 flex-grow">
                <li className="text-sm text-gray-600">✓ 20 analyses per month</li>
                <li className="text-sm text-gray-600">✓ Full viability reports</li>
                <li className="text-sm text-gray-600">✓ Priority email support</li>
                <li className="text-sm text-gray-600">✓ Export to PDF</li>
              </ul>
              <button
                onClick={async () => {
                  try {
                    await getCurrentUser();
                    router.push("/pricing");
                  } catch {
                    setRedirectDestination("/pricing");
                    await signInWithRedirect();
                  }
                }}
                className="w-full rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
              >
                Upgrade Now
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg p-6 flex flex-col bg-white shadow-soft hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-semibold mb-2 text-slate-800">Pro</h3>
              <div className="text-3xl font-bold mb-4 text-slate-900">$15<span className="text-lg text-gray-500">/month</span></div>
              <ul className="space-y-2 mb-6 flex-grow">
                <li className="text-sm text-gray-600">✓ 50 analyses per month</li>
                <li className="text-sm text-gray-600">✓ Full viability reports</li>
                <li className="text-sm text-gray-600">✓ Priority email support</li>
                <li className="text-sm text-gray-600">✓ Export to PDF</li>
                <li className="text-sm text-gray-600">✓ Ask follow up questions</li>
              </ul>
              <button
                onClick={async () => {
                  try {
                    await getCurrentUser();
                    router.push("/pricing");
                  } catch {
                    setRedirectDestination("/pricing");
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
        <section className="bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 text-white py-20 -mx-6 px-6 w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mb-0 pb-20 -mb-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Validate Your Idea?</h2>
            <p className="text-xl text-primary-100 mb-10 leading-relaxed">
              Join entrepreneurs who use AI-powered analysis to make data-driven decisions.
            </p>
            <button
              onClick={async () => {
                try {
                  await getCurrentUser();
                  router.push("/projects/new/discovery");
                } catch {
                  setRedirectDestination("/projects/new/discovery");
                  await signInWithRedirect();
                }
              }}
              className="inline-flex items-center rounded-md bg-white px-8 py-4 text-primary-700 hover:bg-primary-50 transition-colors text-lg font-semibold shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5 transition-all"
            >
              Start Your First Project
            </button>
          </div>
        </section>
      </main>
    );
  }
}

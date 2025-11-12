"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PLANS } from "@/lib/stripe/plans";
import { fetchAuthSession, getCurrentUser, signInWithRedirect } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";
import { setRedirectDestination, getAndClearRedirectDestination } from "@/lib/auth/redirectHelpers";

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string>("free");
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const outOfCredits = searchParams?.get("outOfCredits") === "true";
  const upgradeForPdf = searchParams?.get("upgradeForPdf") === "true";
  const upgradeForPro = searchParams?.get("upgradeForPro") === "true";

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        // Check for redirect destination after sign-in
        const redirectPath = getAndClearRedirectDestination();
        if (redirectPath && redirectPath !== "/pricing") {
          router.push(redirectPath);
          return;
        }
        
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        
        if (idToken) {
          const res = await fetch("/api/user/subscription", {
            headers: { authorization: `Bearer ${idToken}` },
          });
          const data = await res.json();
          if (data.ok && data.plan) {
            setCurrentPlanId(data.plan.id);
            setSubscriptionInfo(data.subscription);
          }
        }
      } catch (error) {
        console.error("Error fetching subscription:", error);
      } finally {
        setLoadingPlan(false);
      }
    })();
  }, [router]);

  function handleCancelClick() {
    setCancelConfirm(true);
  }

  function handleCancelCancel() {
    setCancelConfirm(false);
  }

  async function handleCancelSubscription() {
    setCancellingSubscription(true);
    setError(null);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setError("Please sign in");
        setCancelConfirm(false);
        setCancellingSubscription(false);
        return;
      }

      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}` },
      });

      const data = await res.json();
      if (data.ok) {
        setSuccess(data.message);
        setCancelConfirm(false);
        // Refresh subscription info
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setError(data.error || "Failed to cancel subscription");
        setCancelConfirm(false);
      }
    } catch (e: any) {
      setError(e.message);
      setCancelConfirm(false);
    } finally {
      setCancellingSubscription(false);
    }
  }

  function getPlanIndex(planId: string): number {
    const order = ["free", "starter", "pro"];
    return order.indexOf(planId);
  }

  function isDowngrade(targetPlanId: string): boolean {
    return getPlanIndex(targetPlanId) < getPlanIndex(currentPlanId);
  }

  async function handleSubscribe(planId: string) {
    setLoading(planId);
    try {
      // Check if user is authenticated
      try {
        await getCurrentUser();
      } catch {
        // Not authenticated, redirect to sign in
        setRedirectDestination("/pricing");
        await signInWithRedirect();
        setLoading(null);
        return;
      }

      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setRedirectDestination("/pricing");
        await signInWithRedirect();
        setLoading(null);
        return;
      }

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ planId }),
      });

      const data = await res.json();
      if (data.ok) {
        if (data.url) {
          // Redirect to Stripe Checkout or invoice payment page
          window.location.href = data.url;
        } else if (data.upgraded) {
          // Subscription was updated directly, no need to redirect to Stripe
          setSuccess(data.message || "Subscription upgraded successfully!");
          setTimeout(() => window.location.reload(), 2000);
        } else {
          setError(data.error || "Failed to subscribe");
          setLoading(null);
        }
      } else {
        setError(data.error || "Failed to start checkout");
        setLoading(null);
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(null);
    }
  }

  return (
    <main className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Pricing</h1>
        <p className="mt-2 text-gray-600">Choose a plan that fits your needs</p>
        
        {outOfCredits && (
          <div className="mt-4 inline-block rounded-md bg-red-50 border border-red-200 px-4 py-2 max-w-2xl">
            <p className="text-sm text-red-800 font-medium">
              You've reached your monthly analysis limit. Upgrade your plan to get more analyses this month.
            </p>
          </div>
        )}
        
        {upgradeForPdf && (
          <div className="mt-4 inline-block rounded-md bg-blue-50 border border-blue-200 px-4 py-2 max-w-2xl">
            <p className="text-sm text-blue-800 font-medium">
              Upgrade your subscription to Starter or Pro to export reports to PDF.
            </p>
          </div>
        )}
        
        {upgradeForPro && (
          <div className="mt-4 inline-block rounded-md bg-blue-50 border border-blue-200 px-4 py-2 max-w-2xl">
            <p className="text-sm text-blue-800 font-medium">
              Upgrade to Pro plan to ask questions about your viability reports.
            </p>
          </div>
        )}
        
        {subscriptionInfo?.cancelAtPeriodEnd && (
          <div className="mt-4 inline-block rounded-md bg-yellow-50 border border-yellow-200 px-4 py-2">
            <p className="text-sm text-yellow-800">
              Your subscription will be cancelled on{" "}
              {new Date(subscriptionInfo.currentPeriodEnd).toLocaleDateString()}
            </p>
          </div>
        )}
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

      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-green-800">{success}</p>
            <button
              onClick={() => setSuccess(null)}
              className="text-green-600 hover:text-green-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {cancelConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Cancel Subscription</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelCancel}
                className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                disabled={cancellingSubscription}
              >
                {cancellingSubscription ? "Cancelling..." : "Cancel Subscription"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {Object.values(PLANS)
          .filter((plan) => plan.id !== "starter-to-pro-upgrade") // Hide upgrade product from pricing page
          .map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-lg border bg-white p-6 shadow-soft transition-all hover:shadow-lg ${
              plan.id === "starter" ? "border-2 border-primary-600 relative" : "border-gray-200"
            }`}
          >
            {plan.id === "starter" && (
              <div className="absolute top-0 right-0 bg-primary-600 text-white text-xs px-3 py-1 rounded-bl-lg font-semibold">
                Popular
              </div>
            )}
            <h3 className="text-xl font-semibold text-slate-800">{plan.name}</h3>
            <div className="mt-4">
              <span className="text-4xl font-bold text-slate-900">${plan.priceMonthly}</span>
              <span className="text-gray-500">/month</span>
            </div>
            <ul className="mt-6 space-y-3">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-start text-sm">
                  <span className="mr-2">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6 space-y-2">
              {loadingPlan ? (
                <button className="w-full rounded-md bg-gray-200 px-4 py-2 text-gray-700 flex items-center justify-center gap-2" disabled>
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Processing...
                </button>
              ) : plan.id === currentPlanId ? (
                <>
                  <button
                    className="w-full rounded-md bg-green-100 border border-green-500 px-4 py-2 text-green-700 font-medium"
                    disabled
                  >
                    ✓ Current Plan
                  </button>
                  {plan.id !== "free" && !subscriptionInfo?.cancelAtPeriodEnd && (
                    <button
                      className="w-full rounded-md bg-red-50 border border-red-300 px-4 py-2 text-red-700 text-sm hover:bg-red-100 disabled:opacity-50"
                      onClick={handleCancelClick}
                      disabled={cancellingSubscription}
                    >
                      Cancel Subscription
                    </button>
                  )}
                </>
              ) : isDowngrade(plan.id) ? (
                <button
                  className="w-full rounded-md bg-gray-100 px-4 py-2 text-gray-400 cursor-not-allowed"
                  disabled
                >
                  Downgrade Not Available
                </button>
              ) : (
                <button
                  className="w-full rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-md hover:shadow-lg"
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loading === plan.id}
                >
                  {loading === plan.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : "Upgrade"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <main className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Pricing</h1>
          <p className="mt-2 text-gray-600">Choose a plan that fits your needs</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
        </div>
      </main>
    }>
      <PricingContent />
    </Suspense>
  );
}


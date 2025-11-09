"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PLANS } from "@/lib/stripe/plans";
import { fetchAuthSession, getCurrentUser, signInWithRedirect } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string>("free");
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
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
  }, []);

  async function handleCancelSubscription() {
    if (!confirm("Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period.")) {
      return;
    }

    setCancellingSubscription(true);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        alert("Please sign in");
        return;
      }

      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}` },
      });

      const data = await res.json();
      if (data.ok) {
        alert(data.message);
        // Refresh subscription info
        window.location.reload();
      } else {
        alert(data.error || "Failed to cancel subscription");
      }
    } catch (e: any) {
      alert(e.message);
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
        await signInWithRedirect();
        setLoading(null);
        return;
      }

      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
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
          alert(data.message || "Subscription upgraded successfully!");
          window.location.reload();
        } else {
          alert(data.error || "Failed to subscribe");
        }
      } else {
        alert(data.error || "Failed to start checkout");
        setLoading(null);
      }
    } catch (e: any) {
      alert(e.message);
      setLoading(null);
    }
  }

  return (
    <main className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Pricing</h1>
        <p className="mt-2 text-gray-600">Choose a plan that fits your needs</p>
        
        {subscriptionInfo?.cancelAtPeriodEnd && (
          <div className="mt-4 inline-block rounded-md bg-yellow-50 border border-yellow-200 px-4 py-2">
            <p className="text-sm text-yellow-800">
              Your subscription will be cancelled on{" "}
              {new Date(subscriptionInfo.currentPeriodEnd).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {Object.values(PLANS)
          .filter((plan) => plan.id !== "starter-to-pro-upgrade") // Hide upgrade product from pricing page
          .map((plan) => (
          <div
            key={plan.id}
            className="flex flex-col rounded-lg border bg-white p-6 shadow-sm"
          >
            <h3 className="text-xl font-semibold">{plan.name}</h3>
            <div className="mt-4">
              <span className="text-4xl font-bold">${plan.priceMonthly}</span>
              <span className="text-gray-600">/month</span>
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
                      onClick={handleCancelSubscription}
                      disabled={cancellingSubscription}
                    >
                      {cancellingSubscription ? "Cancelling..." : "Cancel Subscription"}
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
                  className="w-full rounded-md bg-black px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
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


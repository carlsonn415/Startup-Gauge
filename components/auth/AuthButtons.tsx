"use client";

import { useEffect, useState, useRef } from "react";
import { signInWithRedirect, signOut, getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";
import { useRouter } from "next/navigation";

export default function AuthButtons() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<string>("Free");
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchSubscriptionInfo = async () => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      
      if (idToken) {
        try {
          const res = await fetch("/api/user/subscription", {
            headers: { authorization: `Bearer ${idToken.toString()}` },
          });
          const data = await res.json();
          if (data.ok && data.plan) {
            setCurrentPlan(data.plan.name);
          }
        } catch (error) {
          console.error("Error fetching plan:", error);
        }
      }
    } catch (error) {
      console.error("Error fetching subscription info:", error);
    }
  };

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        const user = await getCurrentUser();
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken;
        
        // idToken is already parsed in Amplify v6
        const claims = idToken?.payload || {};
        const userEmail = (typeof claims.email === 'string' ? claims.email : null) || user?.username || null;
        
        console.log("Auth state:", { user: user?.username, email: userEmail, claims });
        setEmail(userEmail);

        // Fetch subscription plan
        await fetchSubscriptionInfo();
      } catch (error) {
        console.log("Not authenticated:", error);
        setEmail(null);
      } finally {
        setLoading(false);
      }
    })();

    // Listen for subscription update events
    const handleSubscriptionUpdate = () => {
      fetchSubscriptionInfo();
    };
    
    window.addEventListener('subscription-updated', handleSubscriptionUpdate);
    
    return () => {
      window.removeEventListener('subscription-updated', handleSubscriptionUpdate);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  async function handleSignIn() {
    try {
      // Ensure Amplify is configured before signing in
      configureAmplify();
      await signInWithRedirect();
    } catch (e) {
      console.error("Sign in error:", e);
      setError("Failed to sign in. Please check your browser console for details.");
      setTimeout(() => setError(null), 5000);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      setEmail(null);
      setShowDropdown(false);
      router.push("/");
    } catch (e) {
      console.error(e);
    }
  }

  function handleUpgrade() {
    setShowDropdown(false);
    router.push("/pricing");
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs max-w-xs">
          <div className="flex items-center justify-between gap-2">
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
      <div className="relative" ref={dropdownRef}>
        {email ? (
          <>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <span>{email}</span>
              <svg
                className={`w-4 h-4 transition-transform ${showDropdown ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-200">
                  <p className="text-xs text-gray-500">Current Plan</p>
                  <p className="text-sm font-medium text-slate-800">{currentPlan}</p>
                </div>
                <button
                  onClick={handleUpgrade}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-gray-50 transition-colors"
                >
                  Upgrade Plan
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-gray-50 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
            onClick={handleSignIn}
          >
            Sign In
          </button>
        )}
      </div>
    </div>
  );
}


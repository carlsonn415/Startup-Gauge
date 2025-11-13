"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { signInWithRedirect, signOut, getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";
import { useRouter } from "next/navigation";

export default function AuthButtons() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<string>("Free");
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [mounted, setMounted] = useState(false);
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
    setMounted(true);
  }, []);

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
        
        setEmail(userEmail);

        // Fetch subscription plan
        await fetchSubscriptionInfo();
      } catch (error) {
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

  function handleSupport() {
    setShowDropdown(false);
    setShowSupportModal(true);
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
                  onClick={handleSupport}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-gray-50 transition-colors"
                >
                  Support
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
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

      {/* Support Modal */}
      {showSupportModal && mounted && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" 
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh" }}
          onClick={() => setShowSupportModal(false)}
        >
          <div 
            className="bg-white rounded-lg p-8 max-w-md mx-4 z-[10000]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-semibold text-slate-900">Support</h3>
              <button
                onClick={() => setShowSupportModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <a href="tel:+12105708783" className="text-lg font-medium text-slate-900 hover:text-primary-600 transition-colors">
                    (210) 570-8783
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <a href="mailto:support@startupgauge.com" className="text-lg font-medium text-slate-900 hover:text-primary-600 transition-colors">
                    carlsonn415@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


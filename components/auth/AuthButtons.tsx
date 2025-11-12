"use client";

import { useEffect, useState } from "react";
import { signInWithRedirect, signOut, getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

export default function AuthButtons() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<string>("Free");
  const [error, setError] = useState<string | null>(null);

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
        console.log("Not authenticated:", error);
        setEmail(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    } catch (e) {
      console.error(e);
    }
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
      <div className="flex items-center gap-3">
        {email ? (
        <>
          <span className="text-xs text-gray-500">{currentPlan} Plan</span>
          <a
            href="/pricing"
            className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
          >
            Upgrade
          </a>
          <span className="text-sm text-gray-700">{email}</span>
          <button className="rounded-md bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300" onClick={handleSignOut}>
            Sign out
          </button>
        </>
      ) : (
        <button className="rounded-md bg-black px-3 py-1 text-sm text-white hover:opacity-90" onClick={handleSignIn}>
          Sign in
        </button>
      )}
      </div>
    </div>
  );
}


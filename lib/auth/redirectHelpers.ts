"use client";

/**
 * Store redirect destination before sign-in
 */
export function setRedirectDestination(path: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("authRedirect", path);
  }
}

/**
 * Get and clear redirect destination after sign-in
 */
export function getAndClearRedirectDestination(): string | null {
  if (typeof window !== "undefined") {
    const redirect = localStorage.getItem("authRedirect");
    if (redirect) {
      localStorage.removeItem("authRedirect");
      return redirect;
    }
  }
  return null;
}

/**
 * Sign in with redirect, storing the intended destination
 */
export async function signInWithRedirectAndStore(path: string) {
  setRedirectDestination(path);
  const { signInWithRedirect } = await import("aws-amplify/auth");
  await signInWithRedirect();
}


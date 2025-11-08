"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

export default function NewProjectPage() {
  const router = useRouter();

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        // Redirect to new discovery flow
        router.replace("/projects/new/discovery");
      } catch {
        // Not authenticated, redirect to home
        router.push("/");
      }
    })();
  }, [router]);

  return (
    <main className="space-y-6">
      <p className="text-gray-600">Redirecting...</p>
    </main>
  );
}


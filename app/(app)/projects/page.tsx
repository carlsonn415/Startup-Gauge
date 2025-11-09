"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";

export default function ProjectsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setCheckingAuth(false);
      } catch {
        // Not authenticated, redirect to home
        router.push("/");
      }
    })();
  }, [router]);

  if (checkingAuth) {
    return (
      <main className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <a className="rounded-md bg-black px-4 py-2 text-white" href="/projects/new">New</a>
      </div>
      <p className="text-gray-600">No projects yet.</p>
    </main>
  );
}

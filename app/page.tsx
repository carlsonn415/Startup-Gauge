"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function HomePage() {
  const searchParams = useSearchParams();
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccess(true);
      // Clear the URL parameter
      window.history.replaceState({}, "", "/");
      // Auto-hide after 5 seconds
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, [searchParams]);

  return (
    <main className="space-y-6">
      {showSuccess && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4">
          <p className="text-green-800 font-medium">
            ✓ Subscription successful! Your account has been upgraded.
          </p>
        </div>
      )}
      
      <h1 className="text-3xl font-bold tracking-tight">Business Viability Calculator</h1>
      <p className="text-gray-600">
        Start by creating a new idea to analyze viability.
      </p>
      <a
        className="inline-flex items-center rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
        href="/projects/new"
      >
        New Idea
      </a>
    </main>
  );
}

"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console or error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-gray-600">
          We encountered an unexpected error. Please try again.
        </p>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm text-gray-500">
              Error details (development only)
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-gray-100 p-4 text-xs">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
      </div>
      <div className="flex gap-4">
        <button
          onClick={reset}
          className="rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          Go home
        </a>
      </div>
    </div>
  );
}


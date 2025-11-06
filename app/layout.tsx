import "../styles/globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import AuthButtons from "@/components/auth/AuthButtons";

export const metadata: Metadata = {
  title: "Biz Viability",
  description: "AI-powered business viability calculator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-6 flex items-center justify-between">
            <a href="/" className="font-semibold">Biz Viability</a>
            <AuthButtons />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}


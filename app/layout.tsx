import "../styles/globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import AuthButtons from "@/components/auth/AuthButtons";

export const metadata: Metadata = {
  title: "Startup Gauge - AI-Powered Business Viability Calculator",
  description: "Validate your business ideas with AI-powered market research, competitor analysis, and comprehensive viability reports. Get data-driven insights to make informed decisions.",
  keywords: ["business viability", "market research", "AI analysis", "business validation", "startup analysis"],
  authors: [{ name: "Startup Gauge" }],
  openGraph: {
    title: "Startup Gauge - AI-Powered Business Viability Calculator",
    description: "Validate your business ideas with AI-powered market research and comprehensive viability reports.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Startup Gauge - AI-Powered Business Viability Calculator",
    description: "Validate your business ideas with AI-powered market research and comprehensive viability reports.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth bg-gradient-fast">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>" />
      </head>
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-0">
          <header className="mb-6 flex items-center justify-between">
            <a href="/" className="font-semibold text-xl text-primary-700 hover:text-primary-600 transition-colors">Startup Gauge</a>
            <AuthButtons />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}


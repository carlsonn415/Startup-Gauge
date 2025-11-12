"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { configureAmplify } from "@/lib/auth/amplifyClient";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function ProjectReportPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [displayedQuestion, setDisplayedQuestion] = useState<string>("");
  const [chatAnswer, setChatAnswer] = useState<string | null>(null);
  const [chatSources, setChatSources] = useState<Array<{ url: string; title: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        setCheckingAuth(false);
        
        // Fetch project with latest analysis
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        
        if (!idToken) {
          router.push("/");
          return;
        }

        // Fetch subscription info
        const subscriptionRes = await fetch("/api/user/subscription", {
          headers: { authorization: `Bearer ${idToken}` },
        });
        if (subscriptionRes.ok) {
          const subscriptionData = await subscriptionRes.json();
          if (subscriptionData.ok && subscriptionData.plan) {
            setCurrentPlan(subscriptionData.plan);
          }
        }

        const res = await fetch(`/api/projects/${projectId}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });
        
        if (res.ok) {
          const response = await res.json();
          if (response.ok && response.data) {
            const projectData = response.data;
            setProject(projectData);
            if (projectData.latestAnalysis?.output) {
              setAnalysis(projectData.latestAnalysis.output);
            } else {
              // No analysis found, but don't redirect - show the "no analysis" message
              setAnalysis(null);
            }
          } else {
            // API returned error - project not found or unauthorized
            console.error("Failed to fetch project:", response.error);
            if (response.error === "Project not found" || response.error === "Unauthorized") {
              router.push("/");
              return;
            }
            setAnalysis(null);
          }
        } else {
          // HTTP error
          const error = await res.json().catch(() => ({ error: "Failed to fetch project" }));
          console.error("HTTP error:", error);
          if (res.status === 404 || res.status === 401) {
            router.push("/");
            return;
          }
          setAnalysis(null);
        }
      } catch (err) {
        // Auth error or other critical error
        console.error("Error loading report:", err);
        router.push("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, router]);

  if (checkingAuth || loading) {
    return (
      <main className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  if (!analysis) {
    return (
      <main className="max-w-4xl mx-auto space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">No Analysis Found</h1>
          <p className="text-gray-600 mt-2">
            This project doesn't have a viability report yet.
          </p>
          <button
            onClick={() => router.push(`/projects/${projectId}/details`)}
            className="mt-4 rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
          >
            Generate Report
          </button>
        </div>
      </main>
    );
  }

  const handleExportPdf = async () => {
    // Check if user has starter or pro subscription
    if (!currentPlan || (currentPlan.id !== "starter" && currentPlan.id !== "pro")) {
      // Redirect to pricing page with upgrade message
      router.push("/pricing?upgradeForPdf=true");
      return;
    }

    setExportingPdf(true);
    try {
      // Get the main content element
      const element = document.getElementById("report-content");
      if (!element) {
        console.error("Report content element not found");
        return;
      }

      // Create canvas from HTML with higher scale for better text quality
      const canvas = await html2canvas(element, {
        scale: 2, // Balanced scale for quality and performance
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        allowTaint: false,
        removeContainer: false,
        imageTimeout: 0,
        onclone: (clonedDoc) => {
          // Ensure text spacing is preserved in cloned document
          const clonedElement = clonedDoc.getElementById("report-content");
          if (clonedElement) {
            // Force text rendering improvements and ensure proper spacing
            clonedElement.style.wordSpacing = "0.1em";
            clonedElement.style.letterSpacing = "0.01em";
            clonedElement.style.fontKerning = "auto";
            clonedElement.style.textRendering = "optimizeLegibility";
            
            // Ensure all text elements have proper spacing
            const allTextElements = clonedElement.querySelectorAll("p, span, div, li, td, th, h1, h2, h3, h4, h5, h6");
            allTextElements.forEach((el: any) => {
              if (el.style) {
                el.style.wordSpacing = "normal"; // Use normal word spacing
                el.style.letterSpacing = "0.01em";
                el.style.whiteSpace = "pre-wrap"; // Preserve spaces and line breaks
                el.style.wordBreak = "break-word";
                el.style.textRendering = "optimizeLegibility";
                
                // Ensure text nodes preserve spaces
                if (el.childNodes) {
                  el.childNodes.forEach((node: any) => {
                    if (node.nodeType === 3) { // Text node
                      node.textContent = node.textContent.replace(/\s+/g, ' '); // Normalize spaces
                    }
                  });
                }
              }
            });
            
            // Fix badge alignment - find all severity badges
            const badges = clonedElement.querySelectorAll('span[class*="bg-red-100"], span[class*="bg-yellow-100"], span[class*="bg-blue-100"]');
            badges.forEach((badge: any) => {
              if (badge.style && badge.textContent && (badge.textContent.trim() === 'HIGH' || badge.textContent.trim() === 'MEDIUM' || badge.textContent.trim() === 'LOW')) {
                badge.style.display = 'table-cell';
                badge.style.verticalAlign = 'middle';
                badge.style.height = '1.75rem';
                badge.style.paddingTop = '0';
                badge.style.paddingBottom = '0';
                badge.style.lineHeight = '1.75rem';
              }
            });
          }
        },
      });

      const pdf = new jsPDF("p", "mm", "a4");
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Use full width with small margins
      const margin = 10;
      const maxWidth = pdfWidth - (margin * 2);
      const maxPageHeight = pdfHeight - (margin * 2);
      
      // Convert canvas pixels to mm
      // html2canvas uses 96 DPI, so: 1 pixel = 25.4mm / 96 = 0.264583mm
      const pixelsToMm = 25.4 / 96;
      const imgWidthMm = imgWidth * pixelsToMm;
      const imgHeightMm = imgHeight * pixelsToMm;
      
      // Calculate aspect ratios
      const imgAspectRatio = imgHeight / imgWidth;
      
      // Scale to use full PDF width
      const scaleFactor = maxWidth / imgWidthMm;
      const imgScaledWidth = maxWidth;
      const imgScaledHeight = imgHeightMm * scaleFactor;
      
      // Calculate how many pages we need
      const totalPages = Math.ceil(imgScaledHeight / maxPageHeight);
      
      // Add pages
      let currentY = 0; // Track position in scaled PDF space
      for (let i = 0; i < totalPages; i++) {
        if (i > 0) {
          pdf.addPage();
        }
        
        // Calculate how much content fits on this page
        const remainingHeight = imgScaledHeight - currentY;
        const pageContentHeight = i === totalPages - 1 
          ? remainingHeight // Last page gets all remaining content
          : maxPageHeight; // Other pages fill to max height
        
        // Convert back to pixel space to extract the right slice
        const pageContentHeightPx = pageContentHeight / (scaleFactor * pixelsToMm);
        const pageStartY = currentY / (scaleFactor * pixelsToMm);
        const pageEndY = pageStartY + pageContentHeightPx;
        const sourceHeight = Math.ceil(pageEndY - pageStartY);
        
        // Ensure we don't exceed image bounds
        const actualPageStartY = Math.floor(pageStartY);
        const actualPageEndY = Math.min(Math.ceil(pageEndY), imgHeight);
        const actualSourceHeight = actualPageEndY - actualPageStartY;
        
        // Create a temporary canvas for this page slice
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = imgWidth;
        pageCanvas.height = actualSourceHeight;
        const pageCtx = pageCanvas.getContext("2d");
        if (pageCtx) {
          // Set high quality rendering
          pageCtx.imageSmoothingEnabled = true;
          pageCtx.imageSmoothingQuality = "high";
          
          // Draw the slice from the main canvas
          pageCtx.drawImage(
            canvas,
            0, actualPageStartY, imgWidth, actualSourceHeight,
            0, 0, imgWidth, actualSourceHeight
          );
          const pageImgData = pageCanvas.toDataURL("image/png", 1.0);
          
          // Calculate actual height in PDF (convert pixels to mm and scale)
          const actualPageHeightMm = (actualSourceHeight * pixelsToMm) * scaleFactor;
          
          // Add to PDF at full width with calculated height
          pdf.addImage(pageImgData, "PNG", margin, margin, imgScaledWidth, actualPageHeightMm);
        }
        
        // Move to next page position
        currentY += pageContentHeight;
      }

      // Generate filename
      const projectTitle = (project?.title || project?.businessIdea || "Viability-Report")
        .replace(/[^a-z0-9]/gi, "-")
        .toLowerCase()
        .substring(0, 50);
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `${projectTitle}-${dateStr}.pdf`;

      // Save PDF
      pdf.save(filename);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!chatQuestion.trim() || chatLoading) return;

    // Check if user has Pro plan before making API call
    if (!currentPlan || currentPlan.id !== "pro") {
      router.push("/pricing?upgradeForPro=true");
      return;
    }

    setChatLoading(true);
    setChatError(null);
    setChatAnswer(null);
    setChatSources([]);

    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      
      if (!idToken) {
        setChatError("Authentication required");
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: chatQuestion.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "Pro plan subscription required for AI chat feature") {
          router.push("/pricing?upgradeForPro=true");
          return;
        } else {
          setChatError(data.error || "Failed to get answer. Please try again.");
        }
        return;
      }

      if (data.ok && data.data) {
        setDisplayedQuestion(chatQuestion.trim());
        setChatAnswer(data.data.answer);
        setChatSources(data.data.sources || []);
        setChatQuestion(""); // Clear question input after successful answer
      } else {
        setChatError("Failed to get answer. Please try again.");
      }
    } catch (err) {
      console.error("Error asking question:", err);
      setChatError("An error occurred. Please try again.");
    } finally {
      setChatLoading(false);
    }
  };

  const handleNewQuestion = () => {
    setChatAnswer(null);
    setDisplayedQuestion("");
    setChatSources([]);
    setChatError(null);
    setChatQuestion("");
  };

  const isProPlan = currentPlan?.id === "pro";

  return (
    <main className="max-w-4xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{project?.title || project?.businessIdea || "Viability Report"}</h1>
        {project?.description && (
          <p className="text-gray-600 mt-1">{project.description}</p>
        )}
        <p className="text-gray-500 mt-1 text-sm">Business Viability Analysis</p>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg"
          >
            {exportingPdf ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export to PDF
              </>
            )}
          </button>
          <button
            onClick={() => router.push("/projects")}
            className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50"
          >
            Back to Projects
          </button>
        </div>
      </div>

      <div id="report-content">

      <div className="space-y-6">
        {/* Summary */}
        <section className="bg-white border-l-4 border-l-primary-600 rounded-lg p-6 shadow-soft">
          <h2 className="text-xl font-semibold mb-3 text-slate-800">Executive Summary</h2>
          <p className="text-gray-700 leading-relaxed">{analysis.summary}</p>
        </section>

        {/* Market Size */}
        <section className="bg-white border-l-4 border-l-primary-500 rounded-lg p-6 shadow-soft">
          <h2 className="text-xl font-semibold mb-3 text-slate-800">Market Size</h2>
          {analysis.marketSizeUsd >= 1_000_000_000 ? (
            <p className="text-2xl font-bold text-gray-900">
              ${(analysis.marketSizeUsd / 1_000_000_000).toFixed(2)}B
            </p>
          ) : analysis.marketSizeUsd >= 1_000_000 ? (
            <p className="text-2xl font-bold text-gray-900">
              ${(analysis.marketSizeUsd / 1_000_000).toFixed(2)}M
            </p>
          ) : analysis.marketSizeUsd >= 1_000 ? (
            <p className="text-2xl font-bold text-gray-900">
              ${(analysis.marketSizeUsd / 1_000).toFixed(2)}K
            </p>
          ) : (
            <p className="text-2xl font-bold text-gray-900">
              ${analysis.marketSizeUsd.toLocaleString()}
            </p>
          )}
          <p className="text-sm text-gray-600 mt-1">Total Addressable Market (TAM)</p>
          {analysis.marketSizeExplanation && (
            <p className="text-sm text-gray-500 mt-2">
              {analysis.marketSizeExplanation}
            </p>
          )}
        </section>

        {/* Risks */}
        <section className="bg-white border-l-4 border-l-warning-500 rounded-lg p-6 shadow-soft">
          <h2 className="text-xl font-semibold mb-3 text-slate-800">Key Risks</h2>
          <ul className="space-y-4">
            {analysis.risks.map((risk: any, idx: number) => {
              // Handle both old format (string) and new format (object)
              const riskObj = typeof risk === 'string' 
                ? { description: risk, severity: 'medium' as const, impact: '' }
                : risk;
              
              const severityColors: Record<string, string> = {
                high: 'bg-red-100 text-red-800 border-red-300',
                medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                low: 'bg-blue-100 text-blue-800 border-blue-300',
              };
              
              const severity = riskObj.severity || 'medium';
              const colorClass = severityColors[severity] || severityColors.medium;
              
              return (
                <li key={idx} className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2 flex-1">
                      <span className="text-warning-600 mt-1 text-xl">⚠️</span>
                      <span className="text-gray-700 font-medium leading-normal">{riskObj.description}</span>
                    </div>
                    <div className="flex items-center justify-center flex-shrink-0" style={{ height: '1.75rem' }}>
                      <span className={`px-2.5 rounded text-xs font-semibold border ${colorClass}`} style={{ lineHeight: '1.2', display: 'inline-block' }}>
                        {severity.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {riskObj.impact && (
                    <p className="text-sm text-gray-600 ml-7 mt-1">{riskObj.impact}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Steps */}
        <section className="bg-white border-l-4 border-l-primary-400 rounded-lg p-6 shadow-soft">
          <h2 className="text-xl font-semibold mb-3 text-slate-800">Launch Roadmap</h2>
          <div className="space-y-4">
            {analysis.steps.map((step: any, idx: number) => (
              <div key={idx} className="border-l-4 border-primary-500 pl-4 py-2 hover:bg-primary-50 rounded-r-lg transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-primary-700">Step {idx + 1}</span>
                  <span className="text-sm text-gray-500">
                    ({step.durationWeeks} weeks)
                  </span>
                </div>
                <h3 className="font-semibold text-slate-800">{step.title}</h3>
                <p className="text-gray-700 mt-1">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Profit Model */}
        <section className="bg-white border-l-4 border-l-success-500 rounded-lg p-6 shadow-soft">
          <h2 className="text-xl font-semibold mb-4 text-slate-800">Financial Projections</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600">Customer Acquisition Cost</p>
              <p className="text-lg font-semibold">${analysis.profitModel.cacUsd}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Lifetime Value</p>
              <p className="text-lg font-semibold">${analysis.profitModel.ltvUsd}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Gross Margin</p>
              <p className="text-lg font-semibold">{analysis.profitModel.grossMarginPct}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Break-Even</p>
              <p className="text-lg font-semibold">{analysis.profitModel.breakEvenMonths} months</p>
            </div>
          </div>
          
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">12-Month Projection</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Month</th>
                    <th className="text-right p-2">Revenue</th>
                    <th className="text-right p-2">Costs</th>
                    <th className="text-right p-2">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.profitModel.monthlyProjection.map((month: any) => (
                    <tr key={month.month} className="border-b">
                      <td className="p-2">{month.month}</td>
                      <td className="text-right p-2">${month.revenueUsd.toLocaleString()}</td>
                      <td className="text-right p-2">${month.costUsd.toLocaleString()}</td>
                      <td className="text-right p-2 font-medium">
                        ${(month.revenueUsd - month.costUsd).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Confidence */}
        <section className="bg-white border-l-4 border-l-primary-600 rounded-lg p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-1 text-slate-800">Confidence Score</h2>
              <p className="text-sm text-gray-600">Based on market data and analysis</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold text-primary-600">{analysis.confidencePct}%</p>
            </div>
          </div>
          {analysis.confidenceReasoning && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Reasoning</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{analysis.confidenceReasoning}</p>
            </div>
          )}
        </section>
      </div>
    </div>

      {/* AI Chat Section */}
      <section className="bg-white border-l-4 border-l-primary-500 rounded-lg p-6 mt-6 shadow-soft">
        <h2 className="text-xl font-semibold mb-4 text-slate-800">Ask Questions About This Report</h2>
        <p className="text-sm text-gray-600 mb-4">
          Get additional insights about your viability report. Each question is answered independently using available market research data.
          {!isProPlan && (
            <span className="block mt-2 text-blue-600 font-medium">
              Pro plan required to use this feature.
            </span>
          )}
        </p>

        {!chatAnswer ? (
          <div className="space-y-4">
            <div>
              <textarea
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleAskQuestion();
                  }
                }}
                placeholder="Ask a question about this viability report... (Cmd/Ctrl + Enter to submit)"
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none transition-all bg-white"
                rows={4}
                disabled={chatLoading}
              />
            </div>
            {chatError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-800">{chatError}</p>
              </div>
            )}
            <button
              onClick={handleAskQuestion}
                disabled={!chatQuestion.trim() || chatLoading}
                className="rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg"
            >
              {chatLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Getting answer...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Ask Question
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-gray-50 border rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 mb-2">Your Question</p>
                  <p className="text-gray-900">{displayedQuestion}</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 mb-2">AI Answer</p>
                  <div className="text-gray-800 whitespace-pre-wrap leading-relaxed">{chatAnswer}</div>
                  {chatSources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <p className="text-xs font-medium text-blue-900 mb-2">Sources:</p>
                      <ul className="space-y-1">
                        {chatSources.map((source, idx) => (
                          <li key={idx} className="text-xs">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-700 hover:text-blue-900 underline"
                            >
                              {source.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleNewQuestion}
              className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ask Another Question
            </button>
          </div>
        )}
      </section>
    </main>
  );
}


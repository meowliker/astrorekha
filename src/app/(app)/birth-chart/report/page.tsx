"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ReportLoadingState from "@/components/ReportLoadingState";
import ReportViewer from "@/components/ReportViewer";

interface ReportRow {
  id: string;
  status: "pending" | "generating" | "complete" | "failed";
  sections: Record<string, string>;
  generated_at?: string;
  chart_details?: {
    basic_details?: Array<{ label: string; value: string }>;
    astro_details?: Array<{ label: string; value: string }>;
    planetary_positions?: Array<{
      planet: string;
      sign: string;
      house: string;
      nakshatra: string;
      pada: string;
    }>;
    lagna_chart_svg?: string | null;
    navamsa_chart_svg?: string | null;
  };
}

type ScreenState = "loading" | "ready" | "needs_birth_chart" | "error";

function getUserId(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("astrorekha_user_id") ||
    localStorage.getItem("astrorekha_anon_id") ||
    ""
  );
}

export default function BirthChartReportPage() {
  const router = useRouter();

  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [report, setReport] = useState<ReportRow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const isFetchingRef = useRef(false);

  const userId = useMemo(() => getUserId(), []);

  const getRequestHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    ...(userId ? { "x-user-id": userId } : {}),
  }), [userId]);

  const fetchFullReport = useCallback(async (reportId: string): Promise<ReportRow | null> => {
    const reportUrl = userId
      ? `/api/birth-chart-report/${reportId}?userId=${encodeURIComponent(userId)}`
      : `/api/birth-chart-report/${reportId}`;

    const response = await fetch(reportUrl, {
      method: "GET",
      headers: getRequestHeaders(),
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as ReportRow;
    return data;
  }, [getRequestHeaders, userId]);

  const checkStatus = useCallback(async (): Promise<{
    status: string;
    report_id?: string;
  } | null> => {
    const statusUrl = userId
      ? `/api/birth-chart-report/status?userId=${encodeURIComponent(userId)}`
      : "/api/birth-chart-report/status";

    const response = await fetch(statusUrl, {
      method: "GET",
      headers: getRequestHeaders(),
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { status: string; report_id?: string };
    return data;
  }, [getRequestHeaders, userId]);

  const generateReport = useCallback(async (force = false) => {
    const response = await fetch("/api/birth-chart-report/generate", {
      method: "POST",
      headers: getRequestHeaders(),
      credentials: "include",
      body: JSON.stringify({ force, userId }),
    });

    if (response.status === 404) {
      const payload = await response.json().catch(() => ({}));
      if (payload?.error === "no_birth_chart_found") {
        setScreenState("needs_birth_chart");
        setIsPolling(false);
        return null;
      }
    }

    if (!response.ok) {
      setErrorMessage("Failed to generate report. Please try again.");
      setScreenState("error");
      setIsPolling(false);
      return null;
    }

    const payload = (await response.json()) as {
      report_id: string;
      status: "pending" | "generating" | "complete" | "failed";
      sections?: Record<string, string>;
      generated_at?: string;
    };

    if (payload.status === "complete" && payload.sections) {
      const fullReport = await fetchFullReport(payload.report_id);
      if (fullReport) {
        setReport(fullReport);
      } else {
        setReport({
          id: payload.report_id,
          status: "complete",
          sections: payload.sections,
          generated_at: payload.generated_at,
        });
      }
      setScreenState("ready");
      setIsPolling(false);
      return payload;
    }

    setScreenState("loading");
    setIsPolling(true);
    return payload;
  }, [getRequestHeaders, userId]);

  const bootstrap = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      setScreenState("loading");
      const status = await checkStatus();

      if (!status) {
        setErrorMessage("Unable to check report status. Please try again.");
        setScreenState("error");
        return;
      }

      if (status.status === "complete" && status.report_id) {
        const fullReport = await fetchFullReport(status.report_id);
        if (fullReport) {
          setReport(fullReport);
          setScreenState("ready");
          setIsPolling(false);
          return;
        }
      }

      if (status.status === "pending" || status.status === "generating") {
        setScreenState("loading");
        setIsPolling(true);
        return;
      }

      if (status.status === "not_started" || status.status === "failed") {
        await generateReport(false);
        return;
      }

      setErrorMessage("Unable to load report status. Please try again.");
      setScreenState("error");
    } finally {
      isFetchingRef.current = false;
    }
  }, [checkStatus, fetchFullReport, generateReport]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!isPolling) return;

    const interval = window.setInterval(async () => {
      const status = await checkStatus();
      if (!status) return;

      if (status.status === "complete" && status.report_id) {
        const fullReport = await fetchFullReport(status.report_id);
        if (fullReport) {
          setReport(fullReport);
          setScreenState("ready");
          setIsPolling(false);
        }
        return;
      }

      if (status.status === "failed") {
        setIsPolling(false);
        setScreenState("error");
        setErrorMessage("Report generation failed. Please try again.");
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [checkStatus, fetchFullReport, isPolling]);

  const handleRegenerate = useCallback(async () => {
    setReport(null);
    setScreenState("loading");
    setIsPolling(false);
    await generateReport(true);
  }, [generateReport]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => router.push("/birth-chart")}
              className="text-white/90 hover:text-white text-sm flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Birth Chart
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {screenState === "loading" && <ReportLoadingState />}

          {screenState === "ready" && report && (
            <ReportViewer
              report={{
                report_id: report.id,
                id: report.id,
                sections: report.sections,
                generated_at: report.generated_at,
              }}
              onRegenerate={handleRegenerate}
            />
          )}

          {screenState === "needs_birth_chart" && (
            <div className="bg-[#1A1F2E] rounded-2xl border border-white/10 p-6 text-center">
              <p className="text-white mb-4">Please complete your birth chart first</p>
              <button
                type="button"
                onClick={() => router.push("/birth-chart")}
                className="rounded-xl px-4 py-2 bg-gradient-to-r from-primary to-purple-600 text-white font-medium"
              >
                Go to Birth Chart
              </button>
            </div>
          )}

          {screenState === "error" && (
            <div className="bg-[#1A1F2E] rounded-2xl border border-red-400/30 p-6 text-center">
              <p className="text-red-300 mb-4">{errorMessage || "Something went wrong."}</p>
              <button
                type="button"
                onClick={() => void bootstrap()}
                className="rounded-xl px-4 py-2 bg-gradient-to-r from-primary to-purple-600 text-white font-medium"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

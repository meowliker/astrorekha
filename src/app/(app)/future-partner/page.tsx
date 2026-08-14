"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart, Loader2, Sparkles, CalendarDays, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPartnerDisplayName } from "@/lib/future-partner-format";
import { useUserStore } from "@/lib/user-store";
import {
  normalizeFuturePartnerReportData,
  type FuturePartnerReportData,
} from "@/lib/future-partner-report-data";
import ReportDisclaimer from "@/components/ReportDisclaimer";

interface FuturePartnerStatusResponse {
  status: "not_started" | "pending" | "generating" | "complete" | "failed";
  report?: FuturePartnerReportData | null;
  generated_at?: string | null;
}

export default function FuturePartnerPage() {
  const router = useRouter();
  const { unlockedFeatures } = useUserStore();
  const bootStartedRef = useRef(false);

  const [status, setStatus] = useState<FuturePartnerStatusResponse["status"]>("not_started");
  const [report, setReport] = useState<FuturePartnerReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");

  const fetchStatus = useCallback(
    async (uid: string) => {
      const response = await fetch(`/api/future-partner-report/status?userId=${encodeURIComponent(uid)}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to check report status right now.");
      }

      const json = (await response.json()) as FuturePartnerStatusResponse;
      setStatus(json.status);
      setReport(normalizeFuturePartnerReportData(json.report));
      return json;
    },
    []
  );

  const waitForGeneratedReport = useCallback(
    async (uid: string) => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const latestStatus = await fetchStatus(uid);

        const latestReport = normalizeFuturePartnerReportData(latestStatus.report);
        if (latestStatus.status === "complete" && latestReport) {
          return latestReport;
        }

        if (latestStatus.status === "failed") {
          throw new Error("Failed to generate report.");
        }
      }

      throw new Error("Report is taking longer than expected. Please try again.");
    },
    [fetchStatus]
  );

  const generateReport = useCallback(
    async (uid: string) => {
      setError("");
      setIsGenerating(true);
      setStatus("generating");

      try {
        const response = await fetch(`/api/future-partner-report/generate?userId=${encodeURIComponent(uid)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const json = await response.json().catch(() => ({}));
        if (response.status === 202 || json?.status === "generating") {
          const generatedReport = await waitForGeneratedReport(uid);
          setStatus("complete");
          setReport(generatedReport);
          return;
        }

        if (!response.ok) {
          throw new Error(json?.message || "Failed to generate report.");
        }

        const nextReport = normalizeFuturePartnerReportData(json?.report);
        if (!nextReport) {
          const generatedReport = await waitForGeneratedReport(uid);
          setStatus("complete");
          setReport(generatedReport);
          return;
        }

        setStatus("complete");
        setReport(nextReport);
      } catch (err: any) {
        setStatus("failed");
        setError(err?.message || "Unable to generate this report right now.");
      } finally {
        setIsGenerating(false);
      }
    },
    [waitForGeneratedReport]
  );

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;

    const boot = async () => {
      try {
        setLoading(true);
        const localUserId = localStorage.getItem("astrorekha_user_id") || "";
        setUserId(localUserId);

        if (!localUserId) {
          setError("Please login again to continue.");
          return;
        }

        const currentStatus = await fetchStatus(localUserId);
        if (currentStatus.status !== "complete") {
          await generateReport(localUserId);
        }
      } catch (err: any) {
        setError(err?.message || "Unable to load this report.");
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, [fetchStatus, generateReport]);

  if (!unlockedFeatures.futurePartnerReport) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] px-4 py-5">
        <div className="mx-auto w-full max-w-md">
          <button
            onClick={() => router.push("/reports")}
            className="mb-4 inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Reports
          </button>

          <div className="rounded-3xl border border-primary/20 bg-[#1A2235] p-5 text-center">
            <h1 className="text-xl font-semibold text-white">Future Partner Report is locked</h1>
            <p className="mt-2 text-sm text-white/60">Unlock it from Reports to access this prediction.</p>
            <Button onClick={() => router.push("/reports")} className="mt-5 w-full">
              Back to Reports
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E1A] px-4 py-5">
      <div className="mx-auto w-full max-w-md">
        <button
          onClick={() => router.push("/reports")}
          className="mb-4 inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Reports
        </button>

        <div className="rounded-3xl border border-primary/20 bg-[#1A2235] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-fuchsia-500/30 to-rose-500/30 p-3">
              <Heart className="h-5 w-5 text-pink-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Future Partner Report</h1>
            </div>
          </div>

          {loading || isGenerating ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-white/80">Reading your chart for marriage timeline and partner clues...</p>
              <p className="mt-1 text-xs text-white/50">This usually takes around 10-20 seconds.</p>
            </div>
          ) : null}

          {!loading && !isGenerating && error ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-300">{error}</p>
              <Button
                onClick={() => userId && generateReport(userId)}
                className="mt-3 w-full bg-red-500/80 hover:bg-red-500"
              >
                Try Again
              </Button>
            </div>
          ) : null}

          {!loading && !isGenerating && report ? (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-fuchsia-500/10 p-4">
                <p className="text-xs uppercase tracking-wide text-white/60">Predicted Partner Name</p>
                <p className="mt-1 text-2xl font-bold text-white">{toPartnerDisplayName(report.partnerName)}</p>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <CalendarDays className="mx-auto h-4 w-4 text-cyan-300" />
                    <p className="mt-1 text-xs text-white/60">Marriage Year</p>
                    <p className="text-sm font-semibold text-white">{report.marriageYear}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <UserRound className="mx-auto h-4 w-4 text-pink-300" />
                    <p className="mt-1 text-xs text-white/60">Partner Age</p>
                    <p className="text-sm font-semibold text-white">{report.partnerAgeAtMarriage}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                    <Sparkles className="mx-auto h-4 w-4 text-amber-300" />
                    <p className="mt-1 text-xs text-white/60">Compat.</p>
                    <p className="text-sm font-semibold text-white">{report.compatibilityScore}%</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-white/60">Relationship Theme</p>
                <p className="mt-1 text-white">{report.relationshipTheme}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-white/60">Marriage Outlook</p>
                <p className="mt-1 text-sm leading-relaxed text-white/80">{report.marriageOutlook}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-white/60">Compatibility Summary</p>
                <p className="mt-1 text-sm leading-relaxed text-white/80">{report.compatibilitySummary}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-emerald-300">Strengths</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-emerald-100/90">
                    {report.strengths.map((item, idx) => (
                      <li key={`${item}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-amber-300">Growth Areas</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-amber-100/90">
                    {report.growthAreas.map((item, idx) => (
                      <li key={`${item}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-white/60">Guidance</p>
                <p className="mt-1 text-sm leading-relaxed text-white/80">{report.guidance}</p>
              </div>

            </motion.div>
          ) : null}

          <ReportDisclaimer text="The predictions are not 100% accurate and should not be treated as professional advice." />
        </div>
      </div>
    </div>
  );
}

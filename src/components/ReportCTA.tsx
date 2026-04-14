"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import ReportDisclaimer from "@/components/ReportDisclaimer";

export default function ReportCTA() {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10"
    >
      <div className="h-px w-full bg-white/10 mb-4" />

      <h3 className="text-white text-lg font-semibold mb-1">Want a deeper reading?</h3>
      <p className="text-white/60 text-sm leading-relaxed mb-4">
        Get your personalized 10-section birth chart report — life predictions,
        career, relationships, current dasha and more.
      </p>

      <button
        type="button"
        onClick={() => router.push("/birth-chart/report")}
        className="w-full rounded-xl px-4 py-3 bg-gradient-to-r from-primary to-purple-600 text-white font-semibold text-sm"
      >
        Get Detailed Report →
      </button>

      <ReportDisclaimer className="mt-4" />
    </motion.div>
  );
}

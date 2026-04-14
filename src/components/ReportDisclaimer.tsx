"use client";

import { cn } from "@/lib/utils";

interface ReportDisclaimerProps {
  className?: string;
  text?: string;
}

const DEFAULT_DISCLAIMER_TEXT =
  "This AI-generated report is for entertainment only — not professional advice — and AstroRekha assumes no liability for any decisions or outcomes based on its content.";

export default function ReportDisclaimer({ className, text }: ReportDisclaimerProps) {
  return (
    <div
      className={cn(
        "mt-5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-[11px] leading-5 text-white/55",
        className
      )}
    >
      {text || DEFAULT_DISCLAIMER_TEXT}
    </div>
  );
}

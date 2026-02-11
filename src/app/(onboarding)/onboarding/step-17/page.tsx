"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Legacy subscription trial page — redirect to bundle pricing
export default function Step17Page() {
  const router = useRouter();
  useEffect(() => { router.replace("/onboarding/bundle-pricing"); }, [router]);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

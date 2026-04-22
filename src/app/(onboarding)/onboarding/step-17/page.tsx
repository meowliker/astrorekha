"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Legacy subscription trial page — redirect to bundle pricing
export default function Step17Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/onboarding/bundle-pricing");

    // Fallback for rare mobile Safari/router stalls.
    const timeoutId = window.setTimeout(() => {
      window.location.replace("/onboarding/bundle-pricing");
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading checkout...</p>
      <Button size="sm" variant="outline" onClick={() => window.location.replace("/onboarding/bundle-pricing")}>
        Continue to Paywall
      </Button>
    </div>
  );
}

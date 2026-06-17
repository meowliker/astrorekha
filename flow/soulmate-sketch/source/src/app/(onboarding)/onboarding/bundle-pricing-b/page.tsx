"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BundlePricingBPage() {
  const router = useRouter();

  useEffect(() => {
    localStorage.setItem("astrorekha_onboarding_flow", "flow-b");
    localStorage.setItem("astrorekha_layout_variant", "B");
    router.replace("/onboarding/bundle-pricing");

    const timeoutId = window.setTimeout(() => {
      window.location.replace("/onboarding/bundle-pricing");
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading checkout...</p>
      <Button size="sm" variant="outline" onClick={() => window.location.replace("/onboarding/bundle-pricing")}>
        Continue to Paywall
      </Button>
    </div>
  );
}

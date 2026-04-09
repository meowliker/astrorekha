"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function BundlePricingBPage() {
  const router = useRouter();

  useEffect(() => {
    localStorage.setItem("astrorekha_onboarding_flow", "flow-b");
    localStorage.setItem("astrorekha_layout_variant", "B");
    router.replace("/onboarding/bundle-pricing");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
    </div>
  );
}


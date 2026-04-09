"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LayoutBFunnelRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/onboarding/step-7");
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
    </div>
  );
}


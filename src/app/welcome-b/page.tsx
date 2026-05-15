"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function WelcomeBRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    localStorage.setItem("astrorekha_onboarding_flow", "flow-a");
    localStorage.setItem("astrorekha_layout_variant", "A");
    router.replace("/welcome");
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
    </div>
  );
}

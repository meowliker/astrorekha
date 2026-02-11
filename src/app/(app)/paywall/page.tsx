"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PaywallPage() {
  const router = useRouter();

  useEffect(() => {
    // Paywall is no longer used — redirect to bundle pricing
    router.replace("/onboarding/bundle-pricing");
  }, [router]);

  return null;
}

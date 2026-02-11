"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Legacy subscription trial page (variant B) — redirect to bundle pricing
export default function AStep17Page() {
  const router = useRouter();
  useEffect(() => { router.replace("/onboarding/bundle-pricing"); }, [router]);
  return null;
}

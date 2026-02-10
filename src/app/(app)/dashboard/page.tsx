"use client";

import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  
  // Redirect to reports page which is the main dashboard
  if (typeof window !== "undefined") {
    router.replace("/reports");
  }
  
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] flex items-center justify-center">
        <p className="text-white/60">Redirecting...</p>
      </div>
    </div>
  );
}

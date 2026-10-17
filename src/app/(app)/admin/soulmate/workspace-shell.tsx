"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";

export function SoulmateWorkspaceShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const token = localStorage.getItem("admin_session_token");
      const expires = Date.parse(localStorage.getItem("admin_session_expiry") || "");
      if (!token || !Number.isFinite(expires) || expires <= Date.now()) {
        router.replace("/admin/login");
        return;
      }
      setReady(true);
    } catch {
      router.replace("/admin/login");
    }
  }, [router]);

  if (!ready) return <main className="min-h-screen bg-[#0A0E1A] p-8 text-white/60" aria-busy="true">Loading admin…</main>;

  return <main className="min-h-screen bg-[#0A0E1A] px-4 py-8 text-white sm:px-8 [color-scheme:dark]">
    <div className="mx-auto max-w-6xl">
      <Link href="/admin" className="mb-8 inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><ArrowLeft size={16} aria-hidden="true" />Admin dashboard</Link>
      <header className="border-b border-white/10 pb-6">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary"><Sparkles size={15} aria-hidden="true" />Soulmate workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-white/60">{description}</p>
      </header>
      {children}
    </div>
  </main>;
}

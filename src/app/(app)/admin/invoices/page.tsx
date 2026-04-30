"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Search } from "lucide-react";

export default function AdminInvoiceGeneratorPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [txnId, setTxnId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("admin_session_token");
    const expiry = localStorage.getItem("admin_session_expiry");

    if (!token || !expiry || new Date(expiry) < new Date()) {
      localStorage.removeItem("admin_session_token");
      localStorage.removeItem("admin_session_expiry");
      router.push("/admin/login");
    }
  }, [router]);

  const openInvoice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUserId = userId.trim();
    const trimmedTxnId = txnId.trim();

    if (!trimmedUserId && !trimmedTxnId) {
      setError("Enter a User ID or Transaction ID.");
      return;
    }

    const params = new URLSearchParams();
    if (trimmedUserId) params.set("userId", trimmedUserId);
    if (trimmedTxnId) params.set("txnId", trimmedTxnId);
    router.push(`/admin/invoices/view?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-white">
      <div className="border-b border-white/10 bg-[#111827]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin")}
              className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              aria-label="Back to admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Invoice Generator</h1>
              <p className="text-xs text-white/45">Temporary admin tool for service delivery proof</p>
            </div>
          </div>
          <FileText className="h-5 w-5 text-amber-300" />
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <form onSubmit={openInvoice} className="rounded-2xl border border-white/10 bg-[#141C2E] p-5">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Find invoice</h2>
            <p className="mt-1 text-sm text-white/45">
              Enter either a user id or PayU transaction/payment id. You can enter both for a stricter lookup.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-white/50">User ID</span>
              <input
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value);
                  setError("");
                }}
                placeholder="7ecbc9d3-2678..."
                className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-white/50">Transaction ID</span>
              <input
                value={txnId}
                onChange={(event) => {
                  setTxnId(event.target.value);
                  setError("");
                }}
                placeholder="TXN_... or PayU payment id"
                className="h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary/60"
              />
            </label>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              <Search className="h-4 w-4" />
              Open Invoice Page
            </button>
            <button
              type="button"
              onClick={() => {
                setUserId("");
                setTxnId("");
                setError("");
              }}
              className="h-10 rounded-lg border border-white/10 px-4 text-sm text-white/65 transition-colors hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

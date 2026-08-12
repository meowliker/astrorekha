"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  XCircle,
} from "lucide-react";

type WhatsappMessage = {
  id: string;
  userId: string | null;
  email: string | null;
  whatsappE164: string | null;
  messageType: string;
  campaignName: string;
  status: string;
  invoiceNumber: string;
  amount: string;
  txnIds: string[];
  reason: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  canResend: boolean;
};

type WhatsappResponse = {
  messages: WhatsappMessage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: Record<string, number>;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
  { value: "pending", label: "Pending" },
  { value: "queued", label: "Queued" },
  { value: "delivered", label: "Delivered" },
];

const IST_TIMEZONE = "Asia/Kolkata";

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeStatus(value: string) {
  return String(value || "unknown").toLowerCase();
}

function getStatusStyle(status: string) {
  const normalized = normalizeStatus(status);
  if (["sent", "delivered", "queued"].includes(normalized)) {
    return {
      icon: CheckCircle2,
      label: normalized === "queued" ? "Queued" : normalized === "delivered" ? "Delivered" : "Sent",
      className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    };
  }
  if (normalized === "pending") {
    return {
      icon: Clock3,
      label: "Pending",
      className: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    };
  }
  if (normalized === "skipped") {
    return {
      icon: AlertCircle,
      label: "Skipped",
      className: "bg-sky-500/15 text-sky-300 border-sky-500/25",
    };
  }
  if (normalized === "failed") {
    return {
      icon: XCircle,
      label: "Failed",
      className: "bg-red-500/15 text-red-300 border-red-500/25",
    };
  }
  return {
    icon: AlertCircle,
    label: status || "Unknown",
    className: "bg-white/10 text-white/70 border-white/10",
  };
}

function StatusPill({ status }: { status: string }) {
  const style = getStatusStyle(status);
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${style.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {style.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "danger" | "warning";
}) {
  const toneClass = {
    neutral: "text-white",
    success: "text-emerald-300",
    danger: "text-red-300",
    warning: "text-amber-300",
  }[tone];

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A2235] p-4">
      <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function AdminWhatsappPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const fetchMessages = useCallback(
    async (showSpinner = true) => {
      const token = localStorage.getItem("admin_session_token");
      const expiry = localStorage.getItem("admin_session_expiry");
      if (!token || !expiry || new Date(expiry) < new Date()) {
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }

      if (showSpinner) setLoading(true);
      setRefreshing(!showSpinner);
      setError("");

      try {
        const params = new URLSearchParams({
          token,
          page: String(page),
          pageSize: "50",
          status: statusFilter,
        });
        if (debouncedSearch) params.set("search", debouncedSearch);

        const response = await fetch(`/api/admin/whatsapp?${params.toString()}`, {
          cache: "no-store",
        });
        if (response.status === 401) {
          localStorage.removeItem("admin_session_token");
          localStorage.removeItem("admin_session_expiry");
          router.push("/admin/login");
          return;
        }
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Failed to fetch WhatsApp sends");
        }

        const body = (await response.json()) as WhatsappResponse;
        setMessages(body.messages || []);
        setSummary(body.summary || {});
        setTotal(body.total || 0);
        setTotalPages(body.totalPages || 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch WhatsApp sends");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch, page, router, statusFilter]
  );

  useEffect(() => {
    fetchMessages(true);
  }, [fetchMessages]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const totalSentLike = useMemo(() => {
    return (summary.sent || 0) + (summary.queued || 0) + (summary.delivered || 0);
  }, [summary]);

  const handleResend = async (messageId: string) => {
    const token = localStorage.getItem("admin_session_token");
    if (!token) {
      router.push("/admin/login");
      return;
    }

    setResendingId(messageId);
    setToast("");
    setError("");
    try {
      const response = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "resend", messageId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error || body.reason || "Resend failed");
      }
      setToast("WhatsApp invoice resent.");
      await fetchMessages(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend WhatsApp invoice");
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E1A] p-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/8 text-white/80 transition hover:bg-white/12 hover:text-white"
              aria-label="Back to admin"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">WhatsApp Sends</h1>
              <p className="text-sm text-white/50">Invoice delivery logs from AiSensy.</p>
            </div>
          </div>
          <button
            onClick={() => fetchMessages(false)}
            disabled={refreshing || loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/12 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryCard label="Total Logs" value={summary.total || 0} tone="neutral" />
          <SummaryCard label="Sent / Queued" value={totalSentLike} tone="success" />
          <SummaryCard label="Failed" value={summary.failed || 0} tone="danger" />
          <SummaryCard label="Skipped" value={summary.skipped || 0} tone="warning" />
          <SummaryCard label="Pending" value={summary.pending || 0} tone="warning" />
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-[#1A2235] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search email, WhatsApp, campaign, or key"
                className="w-full rounded-xl border border-white/10 bg-[#111827] py-2.5 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-primary/60"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2.5 text-sm text-white outline-none transition focus:border-primary/60"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {toast && (
          <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {toast}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1A2235]">
          {loading ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-white/50">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Loading WhatsApp sends...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-white/50">
              <MessageCircle className="h-10 w-10 text-white/25" />
              <div>
                <p className="font-semibold text-white/75">No WhatsApp invoice sends found.</p>
                <p className="mt-1 text-sm">Once invoices are sent through AiSensy, they will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wide text-white/45">
                  <tr>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  {messages.map((message) => (
                    <tr key={message.id} className="align-top transition hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-white/70">
                        <div>{formatDateTime(message.createdAt)}</div>
                        <div className="mt-1 text-xs text-white/35">Sent: {formatDateTime(message.sentAt)}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="font-medium text-white">{message.email || "-"}</div>
                        <div className="mt-1 text-xs text-white/45">{message.whatsappE164 || "-"}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="font-medium text-white">{message.invoiceNumber || "-"}</div>
                        <div className="mt-1 text-xs text-white/45">
                          {message.amount ? `₹${message.amount}` : "-"} • {message.campaignName || "invoice_delivery"}
                        </div>
                        {message.txnIds.length > 0 && (
                          <div className="mt-1 max-w-[280px] truncate text-xs text-white/35">{message.txnIds.join(", ")}</div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill status={message.status} />
                      </td>
                      <td className="max-w-[260px] px-4 py-4 text-sm text-white/55">
                        {message.reason || "-"}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {message.canResend ? (
                          <button
                            onClick={() => handleResend(message.id)}
                            disabled={resendingId === message.id}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                          >
                            {resendingId === message.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            Resend
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/35">
                            <Send className="h-3.5 w-3.5" />
                            Locked
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 text-sm text-white/50 md:flex-row md:items-center md:justify-between">
            <span>
              Showing {messages.length} of {total} sends
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-white/10 p-2 text-white/70 transition hover:bg-white/10 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-24 text-center">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-white/10 p-2 text-white/70 transition hover:bg-white/10 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

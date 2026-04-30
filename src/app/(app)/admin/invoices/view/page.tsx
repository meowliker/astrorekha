"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileJson, Loader2, Printer } from "lucide-react";

type InvoicePayload = {
  invoiceNumber: string;
  invoiceDate: string;
  source: string;
  customer: {
    userId: string;
    name: string;
    email: string;
  };
  payment: {
    status: string;
    type: string;
    gateway: string;
    txnId: string;
    paymentId: string;
    paidAt: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    amount: number;
  }>;
  subtotal: number;
  total: number;
  currency: string;
  unlockedFeatures: string[];
  account: {
    createdAt: string | null;
    updatedAt: string | null;
  };
  orderMetadata: {
    purchaseType: string;
    bundle: string;
    paymentStatus: string;
    primaryTxnId: string;
    primaryPaymentId: string;
    accountCreated: string | null;
    lastUpdated: string | null;
  };
  activity: {
    birthChart: {
      generated: boolean;
      createdAt: string | null;
    };
    palmReading: {
      generated: boolean;
      createdAt: string | null;
    };
    soulmateSketch: {
      generated: boolean;
      createdAt: string | null;
    };
    futurePartnerReport: {
      generated: boolean;
      createdAt: string | null;
    };
  };
};

function formatCurrency(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function hasUnlockedFeature(invoice: InvoicePayload | null, feature: string) {
  return Boolean(
    invoice?.unlockedFeatures.some((item) => item.toLowerCase() === feature.toLowerCase())
  );
}

function AdminInvoiceViewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId") || "";
  const txnId = searchParams.get("txnId") || "";
  const entrySource = searchParams.get("from") || "";
  const isFromOrders = entrySource === "orders";
  const backRoute = isFromOrders ? "/admin/orders" : "/admin/invoices";
  const pageTitle = isFromOrders ? "Digital Delivery Invoice" : "Invoice Preview";
  const pageSubtitle = isFromOrders
    ? "Order proof with invoice details and downloadable PDF"
    : "Review, download, or print this temporary invoice";
  const [invoice, setInvoice] = useState<InvoicePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const fetchInvoice = useCallback(async () => {
    const token = localStorage.getItem("admin_session_token");
    const expiry = localStorage.getItem("admin_session_expiry");

    if (!token || !expiry || new Date(expiry) < new Date()) {
      localStorage.removeItem("admin_session_token");
      localStorage.removeItem("admin_session_expiry");
      router.push("/admin/login");
      return;
    }

    const params = new URLSearchParams({ token, format: "json" });
    if (userId) params.set("userId", userId);
    if (txnId) params.set("txnId", txnId);

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/invoice?${params.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as { invoice?: InvoicePayload; error?: string };
      if (!response.ok || !json.invoice) {
        throw new Error(json.error || "Failed to generate invoice");
      }
      setInvoice(json.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invoice");
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [router, txnId, userId]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  const downloadPdf = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem("admin_session_token") || "";
      const params = new URLSearchParams({ token, format: "pdf" });
      if (userId) params.set("userId", userId);
      if (txnId) params.set("txnId", txnId);
      const response = await fetch(`/api/admin/invoice?${params.toString()}`);
      if (!response.ok) throw new Error("PDF download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.invoiceNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF download failed");
    } finally {
      setDownloading(false);
    }
  };

  const downloadJson = () => {
    if (!invoice) return;
    const blob = new Blob([JSON.stringify(invoice, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.invoiceNumber}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-white">
      <div className="print:hidden border-b border-white/10 bg-[#111827]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(backRoute)}
              className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              aria-label={isFromOrders ? "Back to orders" : "Back to invoice generator"}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">{pageTitle}</h1>
              <p className="text-xs text-white/45">{pageSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadPdf}
              disabled={!invoice || downloading}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </button>
            <button
              onClick={downloadJson}
              disabled={!invoice}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <FileJson className="h-4 w-4" />
              JSON
            </button>
            <button
              onClick={() => window.print()}
              disabled={!invoice}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:bg-white print:p-0">
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#141C2E] px-4 py-16 text-center text-white/50 print:hidden">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
            Loading invoice...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-200 print:hidden">
            {error}
          </div>
        ) : invoice ? (
          <section className="rounded-2xl border border-[#334155] bg-[#1B2233] p-6 text-[#F8FAFC] shadow-2xl print:rounded-none print:border-[#334155] print:bg-[#1B2233] print:p-6 print:text-[#F8FAFC] print:shadow-none">
            <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <h2 className="text-2xl font-bold">AstroRekha Invoice</h2>
              <div className="text-sm leading-5 text-[#E5E7EB] sm:text-right">
                <p>Invoice No: {invoice.invoiceNumber}</p>
                <p>Date: {formatDateTime(invoice.invoiceDate)}</p>
                <p>Currency: {invoice.currency}</p>
              </div>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-2">
              <div className="min-h-[205px] rounded-xl border border-[#334155] bg-[#0F172A] p-4">
                <h3 className="mb-3 text-base font-semibold">Customer</h3>
                <div className="space-y-1 text-sm text-[#E5E7EB]">
                  <p className="break-all">User ID: {invoice.customer.userId}</p>
                  <p>Email: {invoice.customer.email}</p>
                </div>
              </div>

              <div className="min-h-[205px] rounded-xl border border-[#334155] bg-[#0F172A] p-4">
                <h3 className="mb-3 text-base font-semibold">Order Metadata</h3>
                <div className="space-y-1 text-sm text-[#E5E7EB]">
                  <p>Purchase Type: {invoice.orderMetadata.purchaseType}</p>
                  <p>Bundle: {invoice.orderMetadata.bundle}</p>
                  <p>Payment Status: {invoice.orderMetadata.paymentStatus}</p>
                  <p className="break-all">Primary Txn ID: {invoice.orderMetadata.primaryTxnId || "-"}</p>
                  <p className="break-all">Primary Payment ID: {invoice.orderMetadata.primaryPaymentId || "-"}</p>
                  <p>Account Created: {formatDateTime(invoice.orderMetadata.accountCreated)}</p>
                  <p>Last Updated: {formatDateTime(invoice.orderMetadata.lastUpdated)}</p>
                </div>
              </div>
            </div>

            <div className="mb-4 overflow-hidden rounded-xl border border-[#334155]">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[#2B3448] text-[#E5E7EB]">
                  <tr>
                    <th className="w-16 px-4 py-3 text-left font-semibold">#</th>
                    <th className="px-4 py-3 text-left font-semibold">Item</th>
                    <th className="px-4 py-3 text-left font-semibold">Txn ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Paid At (IST)</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount ({invoice.currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={`${item.name}-${index}`} className="border-t border-[#334155] text-[#D1D5DB]">
                      <td className="px-4 py-3">{index + 1}</td>
                      <td className="px-4 py-3">{item.name}</td>
                      <td className="break-all px-4 py-3 text-xs">{invoice.payment.txnId || invoice.payment.paymentId || "-"}</td>
                      <td className="px-4 py-3">{formatDateTime(invoice.payment.paidAt)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.amount, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-h-[140px] rounded-xl border border-[#334155] bg-[#0F172A] p-4">
                <h3 className="mb-3 text-base font-semibold">Unlocked Features</h3>
                {invoice.unlockedFeatures.length ? (
                  <ul className="list-disc space-y-2 pl-5 text-sm text-[#D1D5DB]">
                    {invoice.unlockedFeatures.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#94A3B8]">No unlocked feature metadata found.</p>
                )}
              </div>

              <div className="min-h-[140px] rounded-xl border border-[#334155] bg-[#0F172A] p-4">
                <h3 className="mb-3 text-base font-semibold">Total</h3>
                <p className="text-2xl font-bold">{formatCurrency(invoice.total, invoice.currency)}</p>
                <p className="mt-4 text-xs leading-5 text-[#9CA3AF]">
                  This invoice is generated from AstroRekha transaction logs as proof of purchase and digital delivery.
                </p>
              </div>

              {hasUnlockedFeature(invoice, "Birth Chart Report") ? (
                <div className="rounded-xl border border-[#334155] bg-[#0F172A] p-4">
                  <h3 className="mb-3 text-base font-semibold">Birth Chart Report Activity</h3>
                  <div className="space-y-1 text-sm text-[#D1D5DB]">
                    <p>Generated: {invoice.activity.birthChart.generated ? "Yes" : "No"}</p>
                    <p>Created: {invoice.activity.birthChart.createdAt ? formatDateTime(invoice.activity.birthChart.createdAt) : "-"}</p>
                  </div>
                </div>
              ) : null}

              {hasUnlockedFeature(invoice, "Palm Reading Report") ? (
                <div className="rounded-xl border border-[#334155] bg-[#0F172A] p-4">
                  <h3 className="mb-3 text-base font-semibold">Palm Reading Report Activity</h3>
                  <div className="space-y-1 text-sm text-[#D1D5DB]">
                    <p>Generated: {invoice.activity.palmReading.generated ? "Yes" : "No"}</p>
                    <p>Created: {invoice.activity.palmReading.createdAt ? formatDateTime(invoice.activity.palmReading.createdAt) : "-"}</p>
                  </div>
                </div>
              ) : null}

              {hasUnlockedFeature(invoice, "Soulmate Sketch") ? (
                <div className="rounded-xl border border-[#334155] bg-[#0F172A] p-4">
                  <h3 className="mb-3 text-base font-semibold">Soulmate Sketch Activity</h3>
                  <div className="space-y-1 text-sm text-[#D1D5DB]">
                    <p>Generated: {invoice.activity.soulmateSketch.generated ? "Yes" : "No"}</p>
                    <p>Created: {invoice.activity.soulmateSketch.createdAt ? formatDateTime(invoice.activity.soulmateSketch.createdAt) : "-"}</p>
                  </div>
                </div>
              ) : null}

              {hasUnlockedFeature(invoice, "Future Partner Report") ? (
                <div className="rounded-xl border border-[#334155] bg-[#0F172A] p-4">
                  <h3 className="mb-3 text-base font-semibold">Future Partner Report Activity</h3>
                  <div className="space-y-1 text-sm text-[#D1D5DB]">
                    <p>Generated: {invoice.activity.futurePartnerReport.generated ? "Yes" : "No"}</p>
                    <p>Created: {invoice.activity.futurePartnerReport.createdAt ? formatDateTime(invoice.activity.futurePartnerReport.createdAt) : "-"}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default function AdminInvoiceViewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0A0E1A] px-4 py-16 text-center text-white/50">
          Loading invoice...
        </div>
      }
    >
      <AdminInvoiceViewContent />
    </Suspense>
  );
}

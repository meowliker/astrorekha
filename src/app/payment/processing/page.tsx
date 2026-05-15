"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type PendingPayment = {
  txnid: string;
  type?: string;
  bundleId?: string;
  returnTo?: string;
  createdAt?: string;
};

type PaymentStatusResponse = {
  success?: boolean;
  status?: string;
  type?: string | null;
  bundleId?: string | null;
  userId?: string | null;
};

const PENDING_PAYMENT_KEY = "astrorekha_pending_payu_payment";
const SUCCESS_STATUSES = new Set(["paid", "success", "captured"]);
const FAILED_STATUSES = new Set(["failed", "failure", "bounced", "cancelled", "usercancelled", "dropped"]);

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function getStoredPendingPayment(): PendingPayment | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_PAYMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.txnid === "string" && parsed.txnid.trim()) {
      return parsed;
    }
  } catch {
    // ignore corrupt pending payment state
  }
  return null;
}

function clearPendingPayment(txnid: string) {
  const pending = getStoredPendingPayment();
  if (!pending || pending.txnid === txnid) {
    window.localStorage.removeItem(PENDING_PAYMENT_KEY);
  }
}

function resolveReturnTo(status: PaymentStatusResponse, pending: PendingPayment | null): string {
  const type = normalizeStatus(status.type || pending?.type || "");
  if (type === "bundle" || type === "bundle_payment") {
    return "/onboarding/bundle-upsell-b";
  }
  if (type === "upsell") {
    return "/onboarding/step-19";
  }
  return pending?.returnTo || "/reports";
}

function appendUpsellTxnId(txnid: string) {
  const existing = window.localStorage
    .getItem("astrorekha_upsell_txn_ids")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) || [];
  if (!existing.includes(txnid)) {
    window.localStorage.setItem("astrorekha_upsell_txn_ids", [...existing, txnid].join(","));
  }
}

function PaymentProcessingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storedPending = useMemo(() => getStoredPendingPayment(), []);
  const txnid = searchParams.get("txnid") || storedPending?.txnid || "";
  const source = searchParams.get("source") || "";
  const [statusText, setStatusText] = useState("Confirming your payment...");
  const [isFailed, setIsFailed] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    if (!txnid) {
      setStatusText("We could not find the payment reference for this checkout.");
      setIsFailed(true);
      setCanRetry(true);
      return;
    }

    if (source === "payu_failure") {
      clearPendingPayment(txnid);
      setStatusText("Payment was cancelled or not completed. Please try again.");
      setIsFailed(true);
      setCanRetry(true);
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const checkStatus = async () => {
      attempt += 1;
      try {
        const response = await fetch(`/api/payu/status?txnid=${encodeURIComponent(txnid)}`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as PaymentStatusResponse;
        const normalized = normalizeStatus(data.status);

        if (cancelled) return;

        if (response.ok && SUCCESS_STATUSES.has(normalized)) {
          const pending = getStoredPendingPayment() || storedPending;
          const paymentType = normalizeStatus(data.type || pending?.type || "");
          const bundleId = data.bundleId || pending?.bundleId || "";
          if (bundleId) {
            window.localStorage.setItem("astrorekha_bundle_id", bundleId);
            window.localStorage.setItem("astrorekha_selected_plan", bundleId);
          }
          if (paymentType === "bundle" || paymentType === "bundle_payment") {
            window.localStorage.setItem("astrorekha_main_txn_id", txnid);
          }
          if (paymentType === "upsell") {
            appendUpsellTxnId(txnid);
          }
          if (data.userId) {
            window.localStorage.setItem("astrorekha_user_id", data.userId);
          }
          window.localStorage.setItem("astrorekha_payment_completed", "true");
          window.localStorage.setItem("astrorekha_purchase_type", "one-time");
          clearPendingPayment(txnid);
          setStatusText("Payment confirmed. Opening your next step...");
          router.replace(resolveReturnTo(data, pending));
          return;
        }

        if (FAILED_STATUSES.has(normalized)) {
          clearPendingPayment(txnid);
          setStatusText("Payment was not completed. Please try again.");
          setIsFailed(true);
          setCanRetry(true);
          return;
        }

        setStatusText(
          attempt < 4
            ? "Confirming your payment..."
            : "Still waiting for PayU confirmation. UPI payments can take a little longer."
        );

        if (attempt >= 30) {
          setCanRetry(true);
          return;
        }

        window.setTimeout(checkStatus, attempt < 5 ? 2500 : 5000);
      } catch {
        if (cancelled) return;
        if (attempt >= 8) {
          setStatusText("We are still confirming this payment. Please refresh in a few moments.");
          setCanRetry(true);
          return;
        }
        window.setTimeout(checkStatus, 4000);
      }
    };

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [router, source, storedPending, txnid]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          {isFailed ? (
            <XCircle className="h-7 w-7 text-red-400" />
          ) : canRetry ? (
            <CheckCircle className="h-7 w-7 text-amber-400" />
          ) : (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          )}
        </div>
        <h1 className="text-xl font-semibold text-foreground">Payment Status</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{statusText}</p>
        {txnid && <p className="mt-3 text-xs text-muted-foreground/70">Transaction: {txnid}</p>}
        {canRetry && (
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={() => window.location.reload()} className="w-full">
              Check Again
            </Button>
            <Button variant="outline" onClick={() => router.replace("/onboarding/bundle-pricing")} className="w-full">
              Back to Checkout
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PaymentProcessingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      }
    >
      <PaymentProcessingContent />
    </Suspense>
  );
}

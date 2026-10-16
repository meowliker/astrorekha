"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, Loader2, XCircle } from "lucide-react";
import { watchPayUPayment, type PayUStatus } from "@/lib/payu-checkout-recovery";
import { useUserStore } from "@/lib/user-store";
import { pixelEvents } from "@/lib/pixel-events";
import { Button } from "@/components/ui/button";

type PendingPayment = {
  txnid: string;
  type?: string;
  bundleId?: string;
  returnTo?: string;
  createdAt?: string;
};

type PaymentStatusResponse = PayUStatus;

const PENDING_PAYMENT_KEY = "astrorekha_pending_payu_payment";

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
    return "/onboarding/bundle-upsell";
  }
  if (type === "upsell") {
    return "/onboarding/step-19";
  }
  if (type === "chat_pass") {
    return "/chat";
  }
  const allowed = ["/reports", "/onboarding/bundle-upsell", "/onboarding/step-19", "/chat"];
  return pending?.returnTo && allowed.includes(pending.returnTo) ? pending.returnTo : "/reports";
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
  const [statusText, setStatusText] = useState("Confirming your payment...");
  const [isFailed, setIsFailed] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!txnid) {
      setStatusText("We could not find the payment reference for this checkout.");
      setIsFailed(true);
      setCanRetry(true);
      return;
    }

    setCanRetry(false);
    setIsFailed(false);
    setStatusText("Confirming your payment...");
    let navigationFallback: ReturnType<typeof setTimeout> | undefined;
    const monitor = watchPayUPayment({
      txnid,
      onPaid: (data) => {
        try {
          const pending = getStoredPendingPayment() || storedPending;
          const paymentType = normalizeStatus(data.type || pending?.type || "");
          const bundleId = data.bundleId || pending?.bundleId || "";
          if (bundleId && (paymentType === "bundle" || paymentType === "bundle_payment")) {
            localStorage.setItem("astrorekha_bundle_id", bundleId);
            localStorage.setItem("astrorekha_selected_plan", bundleId);
          }
          if (paymentType === "bundle" || paymentType === "bundle_payment") {
            localStorage.setItem("astrorekha_main_txn_id", txnid);
          }
          if (paymentType === "upsell") appendUpsellTxnId(txnid);
          // Replace the stale anonymous identity only after verified payment.
          if (data.userId) {
            localStorage.setItem("astrorekha_user_id", data.userId);
            localStorage.setItem("astrorekha_anon_id", data.userId);
            useUserStore.getState().setUserId(data.userId);
          }
          localStorage.setItem("astrorekha_payment_completed", "true");
          if (paymentType !== "chat_pass") localStorage.setItem("astrorekha_purchase_type", "one-time");
          clearPendingPayment(txnid);
          // Analytics must not prevent the customer from reaching their purchase.
          try {
            if (typeof data.amount === "number" && data.amount > 0) {
              pixelEvents.purchase(data.amount, bundleId || paymentType, bundleId || paymentType, txnid);
            }
          } catch { /* Server purchase tracking has its own durable retry. */ }
          setStatusText("Payment confirmed. Opening your next step...");
          const destination = resolveReturnTo(data, pending);
          router.replace(destination);
          navigationFallback = setTimeout(() => window.location.replace(destination), 5000);
        } catch {
          setStatusText("Your payment is confirmed, but this browser could not finish saving your session. Enable site storage, then check again. Do not pay again.");
          setCanRetry(true);
        }
      },
      onFailed: () => {
        clearPendingPayment(txnid);
        setStatusText("Payment was not completed. You can return to checkout.");
        setIsFailed(true);
        setCanRetry(true);
      },
      onWaiting: () => setStatusText("Waiting for payment confirmation. If you have been charged, do not pay again; we will check this transaction automatically."),
      onExpired: () => {
        setStatusText("We could not confirm this payment yet. Check again to continue with the same transaction. If you have been charged, do not make another payment.");
        setCanRetry(true);
      },
    });
    const resume = () => { if (document.visibilityState === "visible") void monitor.checkNow(); };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      monitor.stop();
      clearTimeout(navigationFallback);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [router, storedPending, txnid, retryKey]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          {isFailed ? (
            <XCircle className="h-7 w-7 text-red-400" />
          ) : canRetry ? (
            <Clock3 className="h-7 w-7 text-amber-400" />
          ) : (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          )}
        </div>
        <h1 className="text-xl font-semibold text-foreground">Payment Status</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{statusText}</p>
        {txnid && <p className="mt-3 text-xs text-muted-foreground/70">Transaction: {txnid}</p>}
        {canRetry && (
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={() => setRetryKey((value) => value + 1)} className="w-full">
              Check Again
            </Button>
            {isFailed && <Button variant="outline" onClick={() => router.replace("/onboarding/bundle-pricing")} className="w-full">
              Back to Checkout
            </Button>}
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

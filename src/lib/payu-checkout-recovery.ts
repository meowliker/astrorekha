/** Browser recovery only accepts payment status verified by our server. */
export type PayUStatus = {
  success?: boolean;
  status?: string;
  type?: string | null;
  bundleId?: string | null;
  userId?: string | null;
  amount?: number;
};

export const PENDING_PAYU_KEY = "astrorekha_pending_payu_payment";
export type PendingPayU = { txnid: string; type?: string; bundleId?: string; returnTo?: string };

export function readPendingPayU(): PendingPayU | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_PAYU_KEY) || "null");
    return typeof value?.txnid === "string" && value.txnid.trim() ? value : null;
  } catch {
    return null;
  }
}

// Bound both fetch and body decoding: an interrupted request must not strand the UI.
export async function fetchPayUStatus(txnid: string, signal?: AbortSignal, timeoutMs = 15000): Promise<PayUStatus> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => { controller.abort(); reject(new Error("Payment status check interrupted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(onAbort, timeoutMs);
    if (signal?.aborted) onAbort();
  });
  try {
    return await Promise.race([
      aborted,
      (async () => {
        const response = await fetch(`/api/payu/status?txnid=${encodeURIComponent(txnid)}`, {
          cache: "no-store", signal: controller.signal,
        });
        const data = await response.json() as PayUStatus;
        if (!response.ok || data.success !== true) throw new Error("Payment status is temporarily unavailable");
        return data;
      })(),
    ]);
  } finally {
    clearTimeout(timeout!);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** No overlapping requests; retries stop on navigation, a terminal status, or deadline. */
export function watchPayUPayment(options: {
  txnid: string;
  onPaid: (status: PayUStatus) => void;
  onFailed: () => void;
  onWaiting: () => void;
  onExpired: () => void;
  intervalMs?: number;
  maxWaitMs?: number;
  check?: typeof fetchPayUStatus;
}) {
  const controller = new AbortController();
  let stopped = false;
  let checking = false;
  let timer: ReturnType<typeof setTimeout>;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
    controller.abort();
  };
  const checkNow = async () => {
    if (stopped || checking) return;
    clearTimeout(timer);
    checking = true;
    let status: PayUStatus | undefined;
    try {
      status = await (options.check || fetchPayUStatus)(options.txnid, controller.signal);
    } catch {
      // A network/API error is not evidence that payment failed.
    } finally {
      checking = false;
    }
    if (stopped) return;
    const value = String(status?.status || "").toLowerCase();
    if (status?.success && ["paid", "success", "captured"].includes(value)) {
      stop();
      options.onPaid(status);
    } else if (status?.success && ["failed", "failure", "bounced", "cancelled", "usercancelled", "dropped"].includes(value)) {
      stop();
      options.onFailed();
    } else {
      options.onWaiting();
      timer = setTimeout(checkNow, options.intervalMs ?? 5000);
    }
  };
  const deadline = setTimeout(() => { stop(); options.onExpired(); }, options.maxWaitMs ?? 120000);
  void checkNow();
  return { stop, checkNow };
}

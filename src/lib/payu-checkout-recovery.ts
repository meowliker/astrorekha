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
export type PendingPayU = { txnid: string; type?: string; bundleId?: string; returnTo?: string; email?: string; createdAt?: string };

export function readPendingPayU(): PendingPayU | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_PAYU_KEY) || "null");
    return typeof value?.txnid === "string" && value.txnid.trim() ? value : null;
  } catch {
    return null;
  }
}

const PENDING_PAYU_HISTORY_KEY = "astrorekha_pending_payu_history";
const normalizeEmail = (value: string | null | undefined) => (value || "").trim().toLowerCase();

/** Legacy pending records had no owner. Ask only whether this email owns it;
 * do not verify, fulfil, or reveal the other customer's transaction details. */
async function pendingBelongsToEmail(txnid: string, email: string): Promise<boolean> {
  const response = await fetch(`/api/payu/status?${new URLSearchParams({ txnid, checkoutEmail: email })}`, {
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || typeof data.matchesCheckout !== "boolean") {
    throw new Error("We could not check your earlier checkout. Please try again.");
  }
  return data.matchesCheckout;
}

/** Switch the local checkout, never cancel or delete the original payment.
 * Returns true when the caller must reset its in-memory customer state. */
export async function preparePayUCheckoutEmail(emailInput: string): Promise<boolean> {
  const email = normalizeEmail(emailInput);
  if (!email) return false;
  const previousEmail = normalizeEmail(localStorage.getItem("astrorekha_checkout_email") || localStorage.getItem("astrorekha_email"));
  const pending = readPendingPayU();
  let history: PendingPayU[] = [];
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_PAYU_HISTORY_KEY) || "[]");
    if (Array.isArray(saved)) history = saved.filter(p => typeof p?.txnid === "string");
  } catch { /* An invalid history must not prevent a new checkout. */ }
  let differentOwner = false;
  if (pending) {
    const matches = pending.email
      ? normalizeEmail(pending.email) === email
      : await pendingBelongsToEmail(pending.txnid, email);
    if (matches) {
      localStorage.setItem(PENDING_PAYU_KEY, JSON.stringify({ ...pending, email }));
    } else {
      differentOwner = true;
      history = [...history.filter(p => p.txnid !== pending.txnid), pending];
      localStorage.setItem(PENDING_PAYU_HISTORY_KEY, JSON.stringify(history));
      localStorage.removeItem(PENDING_PAYU_KEY);
    }
  }
  if (!readPendingPayU()) {
    const previous = [...history].reverse().find(p => normalizeEmail(p.email) === email);
    if (previous) {
      localStorage.setItem(PENDING_PAYU_KEY, JSON.stringify(previous));
      localStorage.setItem(PENDING_PAYU_HISTORY_KEY, JSON.stringify(history.filter(p => p.txnid !== previous.txnid)));
    }
  }
  const changed = (!!previousEmail && previousEmail !== email) || differentOwner;
  if (changed) {
    // A new email must not inherit either purchases or the previous anonymous ID.
    for (const key of ["astrorekha_user_id", "astrorekha_anon_id", "astrorekha_payment_completed",
      "astrorekha_registration_completed", "astrorekha_purchase_type", "astrorekha_bundle_id",
      "astrorekha_selected_plan", "astrorekha_main_txn_id", "astrorekha_upsell_txn_ids"]) {
      localStorage.removeItem(key);
    }
  }
  localStorage.setItem("astrorekha_email", email);
  localStorage.setItem("astrorekha_checkout_email", email);
  return changed;
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

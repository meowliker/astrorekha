import { type Answers, type DeliveryId, sanitizeAnswers, steps } from "./chat-data";

import { sanitizeAddOnIds, type AddOnId } from "./checkout-addons";

const KEY = "astrorekha-us-soulmate-checkout-details-v1";
export const CHECKOUT_RECOVERY_KEY = "astrorekha-us-soulmate-checkout-v1";
export const CHECKOUT_ATTEMPT_KEY = "astrorekha-us-soulmate-payment-attempt-v3";
export type CheckoutDetails = { answers: Answers; planId: DeliveryId; email: string; addOns?: AddOnId[]; savedAt: number };
let memory: CheckoutDetails | null = null;

export function readCheckoutDetails(): CheckoutDetails | null {
  let saved = memory;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || "null") || memory; } catch { /* Soft navigation still works without storage. */ }
  if (!saved || !Number.isFinite(saved.savedAt) || saved.savedAt < Date.now() - 24 * 3600000 || !["standard", "express"].includes(saved.planId)) return null;
  const answers = sanitizeAnswers(saved.answers);
  if (!steps.every((step) => answers[step])) return null;
  return { planId: saved.planId, savedAt: saved.savedAt, answers, addOns: sanitizeAddOnIds(saved.addOns, saved.planId), email: typeof saved.email === "string" ? saved.email : "" };
}

export function saveCheckoutDetails(details: Omit<CheckoutDetails, "savedAt">) {
  memory = { answers: details.answers, planId: details.planId, email: details.email, addOns: sanitizeAddOnIds(details.addOns, details.planId), savedAt: Date.now() };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory));
    sessionStorage.setItem(CHECKOUT_RECOVERY_KEY, JSON.stringify(memory));
  } catch { /* Keep the answers in memory during client-side navigation. */ }
}

export function prepareCheckout(answers: Answers, planId: DeliveryId) {
  const previous = readCheckoutDetails();
  // A new sketch session must not inherit another customer's contact details.
  const sameAnswers = JSON.stringify(previous?.answers) === JSON.stringify(sanitizeAnswers(answers));
  saveCheckoutDetails({ answers, planId, email: sameAnswers ? previous!.email : "", addOns: sameAnswers ? sanitizeAddOnIds(previous!.addOns, planId) : [] });
}

export function clearCheckoutDetails() {
  memory = null;
  try { sessionStorage.removeItem(KEY); } catch { /* In-memory state has still been cleared. */ }
}

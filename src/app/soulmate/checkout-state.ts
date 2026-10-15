import { type Answers, type DeliveryId, sanitizeAnswers, steps } from "./chat-data";

import { sanitizeAddOnIds, type AddOnId } from "./checkout-addons";

const KEY = "astrorekha-soulmate-checkout-details-v1";
export const CHECKOUT_RECOVERY_KEY = "astrorekha-soulmate-checkout-v1";
export const CHECKOUT_ATTEMPT_KEY = "astrorekha-soulmate-payment-attempt-v1";
export type CheckoutDetails = { answers: Answers; planId: DeliveryId; email: string; phone: string; addOns?: AddOnId[]; savedAt: number };
let memory: CheckoutDetails | null = null;

export function readCheckoutDetails(): CheckoutDetails | null {
  let saved = memory;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || "null") || memory; } catch { /* Soft navigation still works without storage. */ }
  if (!saved || !Number.isFinite(saved.savedAt) || saved.savedAt < Date.now() - 24 * 3600000 || !["standard", "express"].includes(saved.planId)) return null;
  const answers = sanitizeAnswers(saved.answers);
  if (!steps.every((step) => answers[step])) return null;
  return { ...saved, answers, addOns: sanitizeAddOnIds(saved.addOns, saved.planId), email: typeof saved.email === "string" ? saved.email : "", phone: typeof saved.phone === "string" ? saved.phone : "" };
}

export function saveCheckoutDetails(details: Omit<CheckoutDetails, "savedAt">) {
  memory = { ...details, addOns: sanitizeAddOnIds(details.addOns, details.planId), savedAt: Date.now() };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory));
    sessionStorage.setItem(CHECKOUT_RECOVERY_KEY, JSON.stringify(memory));
  } catch { /* Keep the answers in memory during client-side navigation. */ }
}

export function prepareCheckout(answers: Answers, planId: DeliveryId) {
  const previous = readCheckoutDetails();
  // A new sketch session must not inherit another customer's contact details.
  const sameAnswers = JSON.stringify(previous?.answers) === JSON.stringify(sanitizeAnswers(answers));
  saveCheckoutDetails({ answers, planId, email: sameAnswers ? previous!.email : "", phone: sameAnswers ? previous!.phone : "", addOns: sameAnswers ? sanitizeAddOnIds(previous!.addOns, planId) : [] });
}

export function clearCheckoutDetails() {
  memory = null;
  try { sessionStorage.removeItem(KEY); } catch { /* In-memory state has still been cleared. */ }
}

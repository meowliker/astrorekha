export const CHAT_UNLIMITED_PASS_ID = "elysia-unlimited-20m";
export const CHAT_UNLIMITED_PASS_TYPE = "chat_pass";
export const CHAT_UNLIMITED_PASS_FEATURE = "elysia_unlimited_20m";
export const CHAT_UNLIMITED_PASS_NAME = "Unlimited Elysia Chat - 20 Minutes";
export const CHAT_UNLIMITED_PASS_PRICE_INR = 349;
export const CHAT_UNLIMITED_PASS_DURATION_MINUTES = 20;

export const CHAT_UNLIMITED_OFFER_EVENT_NAMES = {
  shown: "chat_unlimited_offer_shown",
  dismissed: "chat_unlimited_offer_dismissed",
  checkoutStarted: "chat_unlimited_offer_checkout_started",
  purchaseSuccess: "chat_unlimited_offer_purchase_success",
} as const;

export function getChatUnlimitedPassEndsAt(startedAt: string | null | undefined): Date | null {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  const startMs = start.getTime();
  if (!Number.isFinite(startMs)) return null;
  return new Date(startMs + CHAT_UNLIMITED_PASS_DURATION_MINUTES * 60 * 1000);
}

export function getChatUnlimitedRemainingSeconds(endsAt: string | Date | null | undefined): number {
  if (!endsAt) return 0;
  const endMs = endsAt instanceof Date ? endsAt.getTime() : new Date(endsAt).getTime();
  if (!Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
}

export function isChatUnlimitedPassActive(endsAt: string | Date | null | undefined): boolean {
  return getChatUnlimitedRemainingSeconds(endsAt) > 0;
}

/** Shared customer screens inherit the signed-in account's pricing/tracking market. */
export function isCustomerAccountPath(path: string): boolean {
  return /^\/(reports|dashboard|chat|profile|settings|scan|palm-reading|birth-chart|horoscope|compatibility|prediction-2026|past-life|numerology|spirit-animal|witch-archetype|soulmate-sketch|future-partner|aura-color|astrocartography|manage-subscription)(?:\/|$)/.test(path);
}

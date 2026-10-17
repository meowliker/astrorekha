// Approved US prices in USD major units. Dedicated envs may override this catalog.
const prices = {
  standard: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_STANDARD ?? "37",
  express: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_EXPRESS ?? "67",
  description: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_DESCRIPTION ?? "67",
  colour: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_COLOUR ?? "37",
  priority: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_PRIORITY ?? "29.95",
  timeline: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_TIMELINE ?? "19",
};
export function usPrice(id: keyof typeof prices) {
  const raw = prices[id];
  if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return NaN;
  const value = Number(raw);
  return value > 0 && value <= 9999 ? value : NaN;
}
export function usPricesReady() { return Object.keys(prices).every((id) => Number.isFinite(usPrice(id as keyof typeof prices))); }

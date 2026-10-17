// USD major units; unset values intentionally never fall back to India prices.
const prices = {
  standard: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_STANDARD,
  express: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_EXPRESS,
  description: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_DESCRIPTION,
  colour: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_COLOUR,
  priority: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_PRIORITY,
  timeline: process.env.NEXT_PUBLIC_US_SOULMATE_PRICE_TIMELINE,
};
export function usPrice(id: keyof typeof prices) {
  const raw = prices[id];
  if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return NaN;
  const value = Number(raw);
  return value > 0 && value <= 9999 ? value : NaN;
}
export function usPricesReady() { return Object.keys(prices).every((id) => Number.isFinite(usPrice(id as keyof typeof prices))); }

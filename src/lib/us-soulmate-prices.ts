// Approved US catalog in USD. Shared by the page and server-side cart calculation.
const prices = Object.freeze({
  standard: 37,
  express: 67,
  description: 67,
  colour: 37,
  priority: 29.95,
  timeline: 19,
});
export function usPrice(id: keyof typeof prices) { return prices[id]; }

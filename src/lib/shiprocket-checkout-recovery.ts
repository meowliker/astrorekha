/** Only allow an order-bound signed resume link on this app. The server verifies its signature. */
export function validShiprocketCheckoutPath(action: string, orderId: string): string | null {
  if (!/^(?:src[a-f0-9]{24}|sm_[a-f0-9]{20})$/.test(orderId)) return null;
  try {
    const url = new URL(action, window.location.origin);
    const state = url.searchParams.getAll("state");
    if (url.origin !== window.location.origin || url.pathname !== "/api/shiprocket/checkout" || url.username || url.password || url.hash || state.length !== 1 ||
      !new RegExp(`^${orderId}\\.\\d+\\.[a-f0-9]{64}$`).test(state[0])) return null;
    return url.pathname + "?" + new URLSearchParams({ state: state[0] });
  } catch { return null; }
}

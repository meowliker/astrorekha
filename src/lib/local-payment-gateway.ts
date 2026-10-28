/** Never use the local override in a production build or a hosted Vercel environment. */
export function localPaymentGateway(): "payu" | "paytm" | null {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) return null;
  const gateway = process.env.LOCAL_PAYMENT_GATEWAY;
  if (!gateway) return null;
  if (gateway !== "payu" && gateway !== "paytm") throw new Error("Invalid local payment gateway");
  return gateway;
}

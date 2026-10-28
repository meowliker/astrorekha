import { isPaytmReportOrderId } from "./paytm-order-id";
/** One fixed, explicitly prepared ₹1 order on a Vercel preview only. */
export function paytmPreviewOrderId(): string | null {
  if (process.env.VERCEL_ENV !== "preview" || !process.env.PAYTM_PREVIEW_TEST_TOKEN) return null;
  const id = process.env.PAYTM_PREVIEW_ORDER_ID || "";
  return isPaytmReportOrderId(id) ? id : null;
}

export function paytmCallbackOrigin(): string {
  if (paytmPreviewOrderId()) {
    const hostname = process.env.VERCEL_URL || "";
    if (!/^[a-zA-Z0-9-]+\.vercel\.app$/.test(hostname)) throw new Error("Invalid preview hostname");
    return `https://${hostname}`;
  }
  return process.env.PAYTM_CALLBACK_ORIGIN || "https://astrorekha.com";
}

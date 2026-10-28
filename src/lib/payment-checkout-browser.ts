/** Hosted Paytm checkout; preserves the existing recovery state saved by each caller. */
export function openPaytmCheckout(data: { gateway?: string; action?: string; fields?: Record<string, string> }): boolean {
  if (data.gateway !== "paytm") return false;
  const url = new URL(data.action || "");
  if (!["https://secure.paytmpayments.com", "https://securestage.paytmpayments.com"].includes(url.origin) || url.pathname !== "/theia/api/v1/showPaymentPage" || !data.fields?.txnToken) throw new Error("Invalid checkout destination");
  const form = document.createElement("form");
  form.method = "POST"; form.action = url.toString();
  for (const [name, value] of Object.entries(data.fields)) {
    const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.appendChild(input);
  }
  document.body.appendChild(form); form.submit();
  return true;
}

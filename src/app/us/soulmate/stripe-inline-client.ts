// Narrow interface for the Stripe.js Checkout Elements APIs used by this page.
// Stripe owns the card inputs; payment details never enter application state.
export type StripeSessionView = {
  currency: string; minorUnitsAmountDivisor: number; canConfirm: boolean;
  total: { total: { minorUnitsAmount: number; amount: string } };
};
export type CheckoutActions = {
  getSession(): StripeSessionView;
  confirm(options: { redirect: "if_required" }): Promise<{ type: "success" } | { type: "error"; error: { message: string } }>;
};
export type PaymentElement = {
  mount(target: HTMLElement): void;
  destroy(): void;
  on(event: "ready" | "loaderror", handler: () => void): void;
};
export type StripeCheckout = {
  createPaymentElement(options: { layout: "tabs"; fields: { billingDetails: { phone: "never" } } }): PaymentElement;
  loadActions(): Promise<{ type: "success"; actions: CheckoutActions } | { type: "error"; error: { message: string } }>;
  on(event: "change", handler: (session: StripeSessionView) => void): void;
};
type StripeFactory = (key: string) => {
  initCheckoutElementsSdk(options: { clientSecret: string; elementsOptions: { appearance: { theme: "stripe"; variables: Record<string, string> } } }): StripeCheckout;
};
let loader: Promise<StripeFactory> | null = null;
export function loadUSStripe(): Promise<StripeFactory> {
  if (loader) return loader;
  loader = new Promise<StripeFactory>((resolve, reject) => {
    const target = window as unknown as { Stripe?: StripeFactory };
    if (target.Stripe) { resolve(target.Stripe); return; }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/endive/stripe.js";
    script.async = true;
    const timeout = window.setTimeout(() => fail(), 20000);
    function fail() {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Secure payment could not load. Please try again."));
    }
    script.onload = () => { window.clearTimeout(timeout); if (target.Stripe) resolve(target.Stripe); else fail(); };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error) => { loader = null; throw error; });
  return loader;
}
export function checkedPaymentTotal(session: StripeSessionView, expectedCents: number) {
  const amount = session.total.total;
  if (session.currency.toLowerCase() !== "usd" || session.minorUnitsAmountDivisor !== 100 || amount.minorUnitsAmount !== expectedCents) {
    throw new Error("Your payment total changed. Please reload checkout before paying.");
  }
  // Read and display Stripe's formatted total as required by Checkout Elements.
  return amount.amount;
}
export async function confirmInlinePayment(actions: CheckoutActions, expectedCents: number) {
  checkedPaymentTotal(actions.getSession(), expectedCents);
  const result = await actions.confirm({ redirect: "if_required" });
  if (result.type === "error") throw new Error(result.error.message);
}
export function checkedReceiptPath(value: unknown): string {
  if (typeof value !== "string" || !/^\/us\/soulmate\/payment\?order=us_sm_[a-f0-9]{20}$/.test(value)) throw new Error("Invalid payment receipt");
  return value;
}

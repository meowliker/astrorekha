// Narrow interface for the Stripe.js Checkout Elements APIs used by this page.
// Stripe owns the card inputs; payment details never enter application state.
export type StripeSessionView = {
  currency: string; minorUnitsAmountDivisor: number; canConfirm: boolean;
  total: { total: { minorUnitsAmount: number; amount: string } };
};
export type CheckoutActions = {
  getSession(): StripeSessionView;
  confirm(options: { redirect: "if_required"; paymentMethod?: string }): Promise<{ type: "success" } | { type: "error"; error: { message: string } }>;
};
export type PaymentElement = {
  mount(target: HTMLElement): void;
  destroy(): void;
  on(event: "ready" | "loaderror", handler: () => void): void;
  on(event: "change", handler: (event: { complete: boolean }) => void): void;
};
export type StripeCheckout = {
  createPaymentElement(options: { layout: "tabs"; fields: { billingDetails: { phone: "never" } } }): PaymentElement;
  loadActions(): Promise<{ type: "success"; actions: CheckoutActions } | { type: "error"; error: { message: string } }>;
  on(event: "change", handler: (session: StripeSessionView) => void): void;
};
export type DeferredElements = {
  update(options: { amount: number }): Promise<void>;
  create(type: "payment", options: { layout: "tabs"; wallets: { link: "never" }; fields: { billingDetails: { email: "never"; phone: "never" } } }): PaymentElement;
  submit(): Promise<{ error?: { message?: string } }>;
};
export type StripeClient = {
  elements(options: { mode: "payment"; amount: number; currency: "usd"; allowedPaymentMethodTypes: ["card"]; paymentMethodCreation: "manual"; appearance: { theme: "stripe"; variables: Record<string, string> } }): DeferredElements;
  createPaymentMethod(options: { elements: DeferredElements; params: { billing_details: { email: string; phone: "" } } }): Promise<{ paymentMethod?: { id: string }; error?: { message?: string } }>;
  initCheckoutElementsSdk(options: { clientSecret: string; elementsOptions: { appearance: { theme: "stripe"; variables: Record<string, string> } } }): StripeCheckout;
};
type StripeFactory = (key: string) => StripeClient;
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
export async function confirmInlinePayment(actions: CheckoutActions, expectedCents: number, payment?: { paymentMethod: string }) {
  checkedPaymentTotal(actions.getSession(), expectedCents);
  // customer_email is fixed when the server creates the Checkout Session.
  // Only forward confirmation options owned by this layer, never contact overrides.
  const result = await actions.confirm({ redirect: "if_required", ...(payment ? { paymentMethod: payment.paymentMethod } : {}) });
  if (result.type === "error") throw new Error(result.error.message);
}
export function checkedReceiptPath(value: unknown): string {
  if (typeof value !== "string" || !/^\/us\/soulmate\/payment\?order=us_sm_[a-f0-9]{20}$/.test(value)) throw new Error("Invalid payment receipt");
  return value;
}

/** Collect card data directly through Stripe; no order is created just by opening the page. */
export async function collectDeferredPayment(stripe: StripeClient, elements: DeferredElements, email: string): Promise<string> {
  if (!/^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(email) || email.length > 254) throw new Error("Please enter a valid email address.");
  const submitted = await elements.submit();
  if (submitted.error) throw new Error(submitted.error.message || "Please complete your card details.");
  // Every field hidden with `never` must be supplied to Stripe, even when optional.
  // An explicit empty phone keeps checkout phone-free without promising a missing value.
  const result = await stripe.createPaymentMethod({ elements, params: { billing_details: { email, phone: "" } } });
  if (result.error || !result.paymentMethod) throw new Error(result.error?.message || "Please check your card details and try again.");
  return result.paymentMethod.id;
}

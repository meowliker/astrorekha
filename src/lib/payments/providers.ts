import { shiprocketProvider } from "./providers/shiprocket";
import { airpayProvider } from "./providers/airpay";
import { payuProvider } from "./providers/payu";
import { paytmProvider } from "./providers/paytm";
import { pineLabsProvider } from "./providers/pinelabs";
import type { CheckoutRequest, PaymentGateway, PaymentProvider } from "./types";

const providers: Record<PaymentGateway, PaymentProvider> = {
  shiprocket: shiprocketProvider, airpay: airpayProvider, payu: payuProvider, paytm: paytmProvider, pinelabs: pineLabsProvider,
};
export function isPaymentGateway(value: unknown): value is PaymentGateway {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(providers, value);
}
export function paymentProvider(value: unknown): PaymentProvider {
  if (!isPaymentGateway(value)) throw new Error("Invalid payment gateway setting");
  return providers[value];
}
/** Call only after persisting the server-priced order; never fall back after a timeout. */
export async function createGatewayCheckout(gateway: PaymentGateway, request: CheckoutRequest) {
  const provider = paymentProvider(gateway);
  if (!Number.isSafeInteger(request.order.amount) || request.order.amount <= 0) throw new Error("Invalid payment amount");
  if ("currency" in request.order && request.order.currency && request.order.currency !== "INR") throw new Error("Unsupported payment currency");
  if (request.order.payment_mode !== provider.mode(request.kind)) throw new Error("Payment environment changed; please start a new checkout");
  if ("gateway" in request.order && (request.order.gateway || "payu") !== gateway) throw new Error("Saved payment gateway mismatch");
  return provider.createCheckout(request);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SoulmateOrder } from "../soulmate-payu";

export type PaymentGateway = "payu" | "paytm" | "pinelabs" | "airpay";
export type CheckoutOrder = {
  id: string; amount: number; currency?: string; customer_email: string;
  gateway?: PaymentGateway;
  customer_name?: string; customer_phone?: string; payment_mode: string;
  product_name?: string; product_info?: string;
};
export type PayUMainFields = {
  key: string; txnid: string; amount: string; productinfo: string; firstname: string;
  email: string; phone: string; udf1: string; udf2: string; udf3: string; udf4: string; udf5: string;
};
export type CheckoutRequest =
  | { kind: "reports"; order: CheckoutOrder; payu?: PayUMainFields }
  | { kind: "soulmate"; order: SoulmateOrder; origin: string };
export type CheckoutResponse = {
  gateway?: PaymentGateway; action?: string; fields?: Record<string, string>;
  txnId?: string; amount?: string; productInfo?: string; hash?: string; key?: string;
  firstName?: string; email?: string; phone?: string;
  udf1?: string; udf2?: string; udf3?: string; udf4?: string; udf5?: string;
};
/** Providers own wire formats; the app owns the saved purchase and its entitlements. */
export interface PaymentProvider {
  id: PaymentGateway;
  mode(kind?: CheckoutRequest["kind"]): string;
  createReportId(): string;
  assertReady(db: SupabaseClient, production: boolean): Promise<void>;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResponse>;
}

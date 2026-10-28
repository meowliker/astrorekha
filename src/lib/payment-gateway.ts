import { getSupabaseAdmin } from "./supabase-admin";
import { paytmConfig } from "./paytm-api";
import { localPaymentGateway } from "./local-payment-gateway";
export type PaymentGateway = "payu" | "paytm";
/** New orders use the admin setting; existing orders always use their saved gateway. */
export async function activePaymentGateway(): Promise<PaymentGateway> {
  const local = localPaymentGateway();
  if (local) {
    if (local === "paytm") {
      if (process.env.PAYTM_ENABLED !== "true") throw new Error("Paytm backup is not enabled");
      paytmConfig();
    }
    return local;
  }
  const { data, error } = await getSupabaseAdmin({ fresh: true }).from("settings").select("value").eq("key", "payment_gateway").maybeSingle();
  if (error) throw new Error("Unable to read payment configuration");
  const gateway = data?.value?.active || "payu";
  if (gateway !== "payu" && gateway !== "paytm") throw new Error("Invalid payment gateway setting");
  if (gateway === "paytm") {
    if (process.env.PAYTM_ENABLED !== "true") throw new Error("Paytm backup is not enabled");
    paytmConfig();
  }
  return gateway;
}

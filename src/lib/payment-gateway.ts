import { pineLabsConfig, pineLabsSigningConfigured } from "./pinelabs-api";
import { getSupabaseAdmin } from "./supabase-admin";
import { paytmConfig } from "./paytm-api";
import { localPaymentGateway } from "./local-payment-gateway";
export type PaymentGateway = "payu" | "paytm" | "pinelabs";
/** New orders use the admin setting; existing orders always use their saved gateway. */
export async function activePaymentGateway(): Promise<PaymentGateway> {
  const local = localPaymentGateway();
  if (local) {
    if (local === "paytm") {
      if (process.env.PAYTM_ENABLED !== "true") throw new Error("Paytm backup is not enabled");
      paytmConfig();
    }
    if (local === "pinelabs") {
      if (process.env.PINELABS_ENABLED !== "true") throw new Error("Pine Labs backup is not enabled");
      await requirePineLabsSetup();
    }
    return local;
  }
  const { data, error } = await getSupabaseAdmin({ fresh: true }).from("settings").select("value").eq("key", "payment_gateway").maybeSingle();
  if (error) throw new Error("Unable to read payment configuration");
  const gateway = data?.value?.active || "payu";
  if (gateway !== "payu" && gateway !== "paytm" && gateway !== "pinelabs") throw new Error("Invalid payment gateway setting");
  if (gateway === "paytm") {
    if (process.env.PAYTM_ENABLED !== "true") throw new Error("Paytm backup is not enabled");
    paytmConfig();
  }
  if (gateway === "pinelabs") {
    if (process.env.PINELABS_ENABLED !== "true") throw new Error("Pine Labs backup is not enabled");
    await requirePineLabsSetup();
  }
  return gateway;
}

async function requirePineLabsSetup() {
  pineLabsConfig();
  if (!pineLabsSigningConfigured()) throw new Error("Pine Labs signing keys are not configured");
  const schema = await getSupabaseAdmin({ fresh: true }).rpc("pinelabs_backup_schema_version");
  if (schema.error || schema.data !== 1) throw new Error("Apply the Pine Labs database migration before checkout");
}

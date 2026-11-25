import { getSupabaseAdmin } from "./supabase-admin";
import { localPaymentGateway } from "./local-payment-gateway";
import { paymentProvider } from "./payments/providers";
export type { PaymentGateway } from "./payments/types";
/** Selector applies only to NEW orders. Recovery uses the persisted gateway. */
export async function activePaymentGateway() {
  const local = localPaymentGateway();
  const db = getSupabaseAdmin({ fresh: true });
  if (local) {
    const provider = paymentProvider(local);
    await provider.assertReady(db, false);
    return provider.id;
  }
  const { data, error } = await db.from("settings").select("value").eq("key", "payment_gateway").maybeSingle();
  if (error) throw new Error("Unable to read payment configuration");
  const provider = paymentProvider(data?.value?.active || "payu");
  await provider.assertReady(db, false);
  return provider.id;
}

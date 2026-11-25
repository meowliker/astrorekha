import { CHAT_UNLIMITED_PASS_ID } from "./chat-unlimited-pass";
import { getSupabaseAdmin } from "./supabase-admin";
import type { CheckoutOrder } from "./payments/types";
import { shiprocketConfig, shiprocketOrigin, shiprocketState, shiprocketVariant, shiprocketCheckoutPayload, shiprocketRequest, sealShiprocketToken, openShiprocketToken } from "./shiprocket-checkout-api";

export async function shiprocketSession(id: string) {
  const read = await getSupabaseAdmin({ fresh: true }).from("shiprocket_checkout_sessions").select("*").eq("order_id", id).eq("payment_mode", shiprocketConfig().mode).maybeSingle();
  if (read.error) throw new Error("Unable to read Fastrr checkout");
  return read.data;
}
/** Reserve before contacting Fastrr: uncertain requests are never automatically replayed. */
export async function initiateShiprocketCheckout(input: CheckoutOrder) {
  const db = getSupabaseAdmin({ fresh: true }), table = input.id.startsWith("sm_") ? "soulmate_orders" : "payments";
  const read = await db.from(table).select("*").eq("id", input.id).eq("gateway", "shiprocket").maybeSingle();
  const order = read.data;
  if (read.error || !order || order.amount !== input.amount || order.payment_mode !== shiprocketConfig().mode || !["created", "pending"].includes(order.payment_status)) throw new Error("Invalid saved Fastrr order");
  const product = table === "payments" ? String(order.bundle_id || (order.type === "chat_pass" ? CHAT_UNLIMITED_PASS_ID : "")).split(",")[0] : order.plan;
  if (!product) throw new Error("Missing Fastrr catalogue product");
  const variantId = shiprocketVariant(table === "payments" ? order.type : "soulmate", product);
  const state = shiprocketState(order.id);
  const reservation = await db.from("shiprocket_checkout_sessions").insert({ order_id: order.id, payment_mode: order.payment_mode, variant_id: variantId, return_state: state });
  if (reservation.error && reservation.error.code !== "23505") throw new Error("Unable to reserve Fastrr checkout");
  let session = await shiprocketSession(order.id);
  if (!reservation.error) {
    const result = await shiprocketRequest("/api/v1/access-token/checkout", shiprocketCheckoutPayload(order, variantId, state));
    const data = result.data as { order_id?: string };
    if (!/^[a-f0-9]{24}$/.test(data?.order_id || "") || typeof result.token !== "string" || !/^[A-Za-z0-9_-]{16,512}$/.test(result.token) ||
      typeof result.expires_at !== "string" || !(Date.parse(result.expires_at) > Date.now())) throw new Error("Invalid Fastrr checkout response");
    const saved = await db.from("shiprocket_checkout_sessions").update({ provider_order_id: data.order_id, token_encrypted: sealShiprocketToken(result.token), expires_at: result.expires_at }).eq("order_id", order.id).is("provider_order_id", null).select("*").single();
    if (saved.error) throw new Error("Fastrr checkout needs recovery; do not create another payment");
    session = saved.data;
  }
  if (!session?.provider_order_id || !session.token_encrypted) throw new Error("Fastrr checkout is being prepared or needs recovery. Please check this order before retrying.");
  // A retry after a DB outage binds the already-created provider order, not a new checkout.
  const bound = await db.from(table).update({ gateway_order_id: session.provider_order_id }).eq("id", order.id).eq("gateway", "shiprocket");
  if (bound.error) throw new Error("Unable to bind Fastrr order");
  if (Date.parse(session.expires_at) <= Date.now()) throw new Error("This checkout expired. Check its payment status before starting again.");
  return { gateway: "shiprocket" as const, action: `${shiprocketOrigin()}/api/shiprocket/checkout?state=${encodeURIComponent(session.return_state)}` };
}
export async function shiprocketBrowserSession(id: string) {
  const session = await shiprocketSession(id);
  if (!session?.token_encrypted || Date.parse(session.expires_at) <= Date.now()) throw new Error("Checkout expired or unavailable");
  return { token: openShiprocketToken(session.token_encrypted), session };
}

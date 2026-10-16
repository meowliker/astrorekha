import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeIndianWhatsappNumber } from "./whatsapp";

/** Resolve the saved checkout account; never let a stale browser ID orphan a payment. */
export async function ensurePaymentUser(params: {
  supabase: SupabaseClient;
  userId?: string;
  email?: string;
  whatsappNumber?: string;
}): Promise<string | null> {
  const { supabase } = params;
  const id = String(params.userId || "").trim();
  const email = String(params.email || "").trim().toLowerCase();
  const lookup = async (column: "id" | "email", value: string) => {
    const { data, error } = await supabase.from("users").select("id, email").eq(column, value).maybeSingle();
    if (error) throw error;
    return data as { id: string; email?: string | null } | null;
  };
  if (email) {
    const existing = await lookup("email", email);
    // Do not overwrite an existing account's profile with stale checkout data.
    if (existing) return existing.id;
  }
  if (!id) throw new Error("Your checkout session could not be found. Please reload the page before paying.");
  const existing = await lookup("id", id);
  if (existing) {
    if (existing.email && email && existing.email.toLowerCase() !== email) {
      throw new Error("Your checkout session belongs to another email. Please sign in with the email you want to use.");
    }
    if (email && !existing.email) {
      const { error } = await supabase.from("users").update({ email }).eq("id", id);
      if (error) {
        if (error.code === "23505") {
          const raced = await lookup("email", email);
          if (raced) return raced.id;
        }
        throw error;
      }
    }
    return existing.id;
  }
  const whatsapp = normalizeIndianWhatsappNumber(params.whatsappNumber);
  const now = new Date().toISOString();
  const { error } = await supabase.from("users").insert({
    id, ...(email ? { email } : {}),
    ...(whatsapp ? { whatsapp_number: whatsapp, whatsapp_opt_in: true, whatsapp_opt_in_at: now, whatsapp_opt_in_source: "payu_initiate" } : {}),
    payment_status: "pending", created_at: now, updated_at: now,
  });
  if (error) {
    if (error.code === "23505") {
      // A second tab may have created the same customer between lookup and insert.
      const raced = email ? await lookup("email", email) : await lookup("id", id);
      if (raced) return raced.id;
    }
    throw error;
  }
  return id;
}

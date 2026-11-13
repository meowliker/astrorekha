import type { SupabaseClient } from "@supabase/supabase-js";
import { matchesAdSource, type AdSource } from "./admin-acquisition";

/** Filter before pagination/counting; a page must never hide matching later orders. */
export async function sourceOrderPage(db: SupabaseClient, table: "soulmate_orders" | "us_soulmate_orders", source: AdSource, mode: string | null, search: string, page: number) {
  if (source === "all") return null;
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    if (offset >= 100000) throw new Error("Narrow the order search to filter this many orders.");
    let query = db.from(table).select("id,attribution").eq("funnel", table === "soulmate_orders" ? "soulmate_standalone" : "us_soulmate_standalone").eq("payment_status", "paid");
    if (mode === "test" || mode === "live") query = query.eq("payment_mode", mode);
    if (search) query = query.or(`id.ilike.%${search}%,customer_email.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
    const result = await query.order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (result.error) throw new Error("Unable to filter order sources.");
    for (const row of result.data) if (matchesAdSource(row, source)) ids.push(row.id);
    if (result.data.length < 1000) break;
  }
  return { ids: ids.slice(page * 25, (page + 1) * 25), total: ids.length };
}

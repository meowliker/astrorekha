import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/soulmate-admin";
import { refreshSoulmateDeliveryStatuses } from "@/lib/soulmate-fulfillment";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const page = Math.max(0, Math.min(10000, Number(request.nextUrl.searchParams.get("page")) || 0));
    const mode = request.nextUrl.searchParams.get("mode");
    const search = (request.nextUrl.searchParams.get("search") || "").replace(/[^\p{L}\p{N} @._+-]/gu, "").slice(0, 100);
    let query = db.from("soulmate_orders").select("id,plan,product_info,attribution,customer_name,customer_email,customer_phone,answers,answer_revision,answers_updated_at,catalog_version,line_items,add_ons,entitlements,base_amount,gst_amount,amount,payment_status,payment_mode,gateway,gateway_transaction_id,payu_payment_id,paid_at,created_at,scheduled_send_at,delivery_due_at,review_status,reviewed_at,review_note,fulfillment_status,delivered_at", { count: "exact" }).eq("funnel", "soulmate_standalone").eq("payment_status", "paid");
    if (mode === "test" || mode === "live") query = query.eq("payment_mode", mode);
    if (search) query = query.or(`id.ilike.%${search}%,customer_email.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
    const result = await query.order("created_at", { ascending: false }).order("id").range(Math.floor(page) * 25, Math.floor(page) * 25 + 24);
    if (result.error) throw new Error("Unable to load orders");
    const syncFailures = await refreshSoulmateDeliveryStatuses(db, result.data);
    const ids = result.data.map((row) => row.id);
    const [jobs, emails, assets] = ids.length ? await Promise.all([
      db.from("soulmate_generation_jobs").select("order_id,status,generation_attempts,last_error,storage_path").in("order_id", ids),
      db.from("soulmate_email_deliveries").select("order_id,status,scheduled_at,submitted_at,sent_at,delivered_at,last_error").in("order_id", ids),
      db.from("soulmate_order_assets").select("order_id,kind,filename,uploaded_at,size_bytes").in("order_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    if (jobs.error || emails.error || assets.error) throw new Error("Unable to load delivery details");
    return NextResponse.json({ deliverySyncWarning: syncFailures ? "Email status could not be refreshed from Brevo. Showing saved status; try Refresh again." : null, orders: result.data.map(({ attribution, ...row }) => ({ ...row, checkout_environment: ["local", "preview", "production"].includes(attribution?.trackingEnvironment) ? attribution.trackingEnvironment : "unknown", generation: jobs.data?.find((j) => j.order_id === row.id) || null, email: emails.data?.find((e) => e.order_id === row.id) || null, assets: assets.data?.filter((a) => a.order_id === row.id) || [] })), total: result.count, page: Math.floor(page) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to load soulmate orders. Check the database migration and try again." }, { status: 503 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin, validSoulmateId } from "@/lib/soulmate-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validSoulmateId(params.id)) return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });

  try {
    const order = await db.from("soulmate_orders")
      .select("id,plan,product_info,attribution,customer_name,customer_email,customer_phone,answers,catalog_version,line_items,add_ons,entitlements,base_amount,gst_amount,amount,payment_status,payment_mode,payu_payment_id,paid_at,created_at,scheduled_send_at,delivery_due_at,review_status,reviewed_at,review_note,fulfillment_status,delivered_at")
      .eq("funnel", "soulmate_standalone").eq("id", params.id).maybeSingle();
    if (order.error) throw new Error("Unable to load order");
    if (!order.data) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const [jobs, emails, assets] = await Promise.all([
      db.from("soulmate_generation_jobs").select("order_id,status,generation_attempts,last_error,storage_path").eq("order_id", params.id).maybeSingle(),
      db.from("soulmate_email_deliveries").select("order_id,status,scheduled_at,submitted_at,sent_at,delivered_at,last_error").eq("order_id", params.id).maybeSingle(),
      db.from("soulmate_order_assets").select("order_id,kind,filename,uploaded_at,size_bytes").eq("order_id", params.id),
    ]);
    if (jobs.error || emails.error || assets.error) throw new Error("Unable to load delivery details");

    const { attribution, ...row } = order.data;
    const checkoutEnvironment = ["local", "preview", "production"].includes(attribution?.trackingEnvironment)
      ? attribution.trackingEnvironment
      : "unknown";
    return NextResponse.json({
      order: {
        ...row,
        checkout_environment: checkoutEnvironment,
        generation: jobs.data || null,
        email: emails.data || null,
        assets: assets.data || [],
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load this Soulmate order." }, { status: 503 });
  }
}

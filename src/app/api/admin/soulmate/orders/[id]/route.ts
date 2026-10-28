import { soulmateWhatsAppEligible } from "@/lib/soulmate-whatsapp";
import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin, validSoulmateId } from "@/lib/soulmate-admin";
import { sanitizeAnswers, steps } from "@/app/soulmate/chat-data";
import { SKETCH_BUCKET, refreshSoulmateDeliveryStatuses } from "@/lib/soulmate-fulfillment";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validSoulmateId(params.id)) return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });

  try {
    const order = await db.from("soulmate_orders")
      .select("id,plan,product_info,attribution,customer_name,customer_email,customer_phone,answers,answer_revision,answers_updated_at,catalog_version,line_items,add_ons,entitlements,base_amount,gst_amount,amount,payment_status,payment_mode,payu_payment_id,gateway,gateway_transaction_id,paid_at,created_at,scheduled_send_at,delivery_due_at,review_status,reviewed_at,review_note,fulfillment_status,delivered_at")
      .eq("funnel", "soulmate_standalone").eq("id", params.id).maybeSingle();
    if (order.error) throw new Error("Unable to load order");
    if (!order.data) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const syncFailures = await refreshSoulmateDeliveryStatuses(db, [order.data]);
    const [jobs, emails, assets, whatsapp] = await Promise.all([
      db.from("soulmate_generation_jobs").select("order_id,status,generation_attempts,last_error,storage_path").eq("order_id", params.id).maybeSingle(),
      db.from("soulmate_email_deliveries").select("order_id,status,scheduled_at,submitted_at,sent_at,delivered_at,last_error").eq("order_id", params.id).maybeSingle(),
      db.from("soulmate_order_assets").select("order_id,kind,filename,uploaded_at,size_bytes").eq("order_id", params.id),
      db.from("soulmate_whatsapp_deliveries").select("kind,status,submitted_at,accepted_at,last_error").eq("order_id", params.id),
    ]);
    if (jobs.error || emails.error || assets.error) throw new Error("Unable to load delivery details");

    const { attribution, ...row } = order.data;
    const checkoutEnvironment = ["local", "preview", "production"].includes(attribution?.trackingEnvironment)
      ? attribution.trackingEnvironment
      : "unknown";
    return NextResponse.json({
      deliverySyncWarning: syncFailures ? "Email status could not be refreshed from Brevo. Showing saved status; try Refresh again." : null,
      order: {
        ...row,
        fulfillment_status: emails.data?.status === "delivered" ? "delivered" : row.fulfillment_status,
        delivered_at: row.delivered_at || emails.data?.delivered_at || null,
        checkout_environment: checkoutEnvironment,
        generation: jobs.data || null,
        email: emails.data || null,
        assets: assets.data || [],
        whatsapp: { eligible: soulmateWhatsAppEligible(order.data), messages: whatsapp.data || [], unavailable: Boolean(whatsapp.error) },
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load this Soulmate order." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validSoulmateId(params.id)) return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });

  try {
    const body = await request.json();
    const answers = sanitizeAnswers(body?.answers);
    if (steps.some((step) => !answers[step])) return NextResponse.json({ error: "Complete every answer before saving." }, { status: 400 });

    const result = await db.rpc("revise_soulmate_order_answers", { p_order: params.id, p_answers: answers });
    if (result.error) {
      const message = result.error.message || "";
      if (message.includes("Delivered") || message.includes("submitted") || message.includes("delivery has already started")) return NextResponse.json({ error: "Answers cannot be changed after delivery has started." }, { status: 409 });
      if (message.includes("not paid")) return NextResponse.json({ error: "Only paid orders can be revised." }, { status: 409 });
      throw new Error("Unable to revise order answers");
    }
    const paths = Array.isArray(result.data) ? result.data.filter((value): value is string => typeof value === "string") : [];
    if (paths.length) await db.storage.from(SKETCH_BUCKET).remove(paths);
    return NextResponse.json({ success: true, answerRevisionUpdated: true });
  } catch {
    return NextResponse.json({ error: "Unable to save the revised answers." }, { status: 503 });
  }
}

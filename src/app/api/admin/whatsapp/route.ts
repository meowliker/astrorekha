import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resendInvoiceDeliveryWhatsappMessage } from "@/lib/whatsapp-invoice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WhatsappStatus = "all" | "pending" | "sent" | "queued" | "delivered" | "failed" | "skipped";

type WhatsappMessageRow = {
  id: string;
  user_id: string | null;
  whatsapp_e164: string | null;
  email: string | null;
  message_type: string;
  aisensy_campaign_name: string | null;
  template_name: string | null;
  status: string;
  dedupe_key: string | null;
  payload: Record<string, unknown> | null;
  response: unknown;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

function cleanText(value: unknown): string {
  return String(value || "").trim();
}

async function assertAdminSession(token: string | null) {
  if (!token) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = getSupabaseAdmin();
  const { data: sessionData } = await supabase
    .from("admin_sessions")
    .select("id, expires_at")
    .eq("id", token)
    .maybeSingle();

  if (!sessionData || new Date(sessionData.expires_at) < new Date()) {
    return { ok: false as const, response: NextResponse.json({ error: "Session expired" }, { status: 401 }) };
  }

  return { ok: true as const, supabase };
}

function getPayloadString(payload: Record<string, unknown> | null, key: string): string {
  const value = payload?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function getResponseReason(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const record = response as Record<string, unknown>;
  const reason = cleanText(record.reason || record.message || record.error);
  if (reason) return reason;
  const nestedError = record.error;
  if (nestedError && typeof nestedError === "object") {
    return cleanText((nestedError as Record<string, unknown>).message);
  }
  return "";
}

function formatMessage(row: WhatsappMessageRow) {
  const payload = row.payload || {};
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    whatsappE164: row.whatsapp_e164,
    messageType: row.message_type,
    campaignName: row.aisensy_campaign_name || row.template_name || "",
    status: row.status,
    dedupeKey: row.dedupe_key,
    invoiceNumber: getPayloadString(payload, "invoiceNumber"),
    amount: getPayloadString(payload, "amount"),
    txnIds: Array.isArray(payload.txnIds) ? payload.txnIds.map((txnId) => cleanText(txnId)).filter(Boolean) : [],
    reason: getResponseReason(row.response),
    payload,
    response: row.response,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canResend: row.message_type === "invoice_delivery" && ["failed", "skipped"].includes(row.status),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const session = await assertAdminSession(searchParams.get("token"));
    if (!session.ok) return session.response;

    const status = (searchParams.get("status") || "all") as WhatsappStatus;
    const search = cleanText(searchParams.get("search")).toLowerCase();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 50)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = session.supabase
      .from("whatsapp_messages")
      .select("*", { count: "exact" })
      .eq("message_type", "invoice_delivery")
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `email.ilike.%${search}%,whatsapp_e164.ilike.%${search}%,aisensy_campaign_name.ilike.%${search}%,dedupe_key.ilike.%${search}%`
      );
    }

    const { data, count, error } = await query.range(from, to);
    if (error) {
      throw new Error(error.message);
    }

    const { data: summaryRows } = await session.supabase
      .from("whatsapp_messages")
      .select("status")
      .eq("message_type", "invoice_delivery");

    const summary = (summaryRows || []).reduce(
      (acc, row) => {
        const key = cleanText((row as { status?: string }).status) || "unknown";
        acc.total += 1;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      { total: 0 } as Record<string, number>
    );

    return NextResponse.json({
      messages: ((data || []) as WhatsappMessageRow[]).map(formatMessage),
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      summary,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch WhatsApp sends";
    console.error("[admin/whatsapp] fetch failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = await assertAdminSession(cleanText(body.token));
    if (!session.ok) return session.response;

    const action = cleanText(body.action);
    const messageId = cleanText(body.messageId);
    if (action !== "resend" || !messageId) {
      return NextResponse.json({ error: "action=resend and messageId are required" }, { status: 400 });
    }

    const result = await resendInvoiceDeliveryWhatsappMessage(messageId);
    return NextResponse.json({ success: result.success, status: result.status, reason: result.reason });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to resend WhatsApp invoice";
    console.error("[admin/whatsapp] resend failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

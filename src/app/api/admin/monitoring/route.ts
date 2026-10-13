import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runMonitoring, validSlackChatId, validSlackWebhook } from "@/lib/system-monitoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

async function authorized(request: NextRequest) {
  const db = getSupabaseAdmin();
  const token = request.headers.get("x-admin-session");
  if (!token) return null;
  const { data, error } = await db.from("admin_sessions")
    .select("id,expires_at").eq("id", token).maybeSingle();
  return !error && data && new Date(data.expires_at) > new Date() ? db : null;
}

const validId = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function GET(request: NextRequest) {
  const db = await authorized(request);
  if (!db) return json({ error: "Unauthorized" }, 401);
  const [runs, incidents, destinations, notifications] = await Promise.all([
    db.from("monitoring_runs").select("id,trigger,started_at,finished_at,status,checks,alert_count")
      .order("started_at", { ascending: false }).limit(30),
    db.from("monitoring_incidents").select("check_key,status,message,opened_at,last_seen_at")
      .eq("active", true).order("opened_at", { ascending: false }),
    db.from("monitoring_destinations").select("id,kind,label,address,enabled,created_at")
      .order("created_at", { ascending: true }),
    db.from("monitoring_notifications").select("id,check_key,event,destination_kind,destination_label,delivered,error,sent_at")
      .order("sent_at", { ascending: false }).limit(50),
  ]);
  if (runs.error || incidents.error || destinations.error || notifications.error) {
    return json({ error: "Unable to read monitoring data. Check that the monitoring migration was applied." }, 500);
  }
  return json({
    runs: runs.data || [], incidents: incidents.data || [], notifications: notifications.data || [],
    deliveryConfig: { emailReady: !!process.env.BREVO_API_KEY, slackBotReady: !!process.env.SLACK_BOT_TOKEN },
    destinations: (destinations.data || []).map(({ address, ...row }) => ({
      ...row, address: row.kind === "slack" ? "•••••••• (saved securely)" : address,
    })),
  });
}

export async function POST(request: NextRequest) {
  const db = await authorized(request);
  if (!db) return json({ error: "Unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  if (body?.action === "run") {
    try {
      const result = await runMonitoring(db, "manual");
      return json(result);
    } catch (error) {
      console.error("Manual monitoring run failed", error);
      return json({ error: "Monitoring run failed. Review server logs and the monitoring migration." }, 500);
    }
  }
  const kind = body?.kind;
  const label = String(body?.label || "").trim().slice(0, 80);
  const address = String(body?.address || "").trim();
  if (kind !== "email" && kind !== "slack" && kind !== "slack_chat") return json({ error: "Choose email or Slack." }, 400);
  if (!label) return json({ error: "Enter a label." }, 400);
  if (address.length > 1024 || (kind === "email"
    ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
    : kind === "slack" ? !validSlackWebhook(address) : !validSlackChatId(address))) {
    return json({ error: "Enter a valid email address, Slack incoming webhook URL, or Slack conversation ID." }, 400);
  }
  const { count, error: countError } = await db.from("monitoring_destinations")
    .select("id", { count: "exact", head: true });
  if (countError) return json({ error: "Unable to check alert destinations." }, 500);
  if ((count || 0) >= 30) return json({ error: "Maximum of 30 destinations reached." }, 400);
  const { error } = await db.from("monitoring_destinations").insert({ kind, label, address, enabled: true });
  if (error) return json({ error: "Unable to save destination." }, 500);
  return json({ success: true }, 201);
}

export async function PATCH(request: NextRequest) {
  const db = await authorized(request);
  if (!db) return json({ error: "Unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  if (!validId(body?.id) || typeof body?.enabled !== "boolean") return json({ error: "Invalid destination." }, 400);
  const { error } = await db.from("monitoring_destinations").update({ enabled: body.enabled }).eq("id", body.id);
  return error ? json({ error: "Unable to update destination." }, 500) : json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const db = await authorized(request);
  if (!db) return json({ error: "Unauthorized" }, 401);
  const id = request.nextUrl.searchParams.get("id");
  if (!validId(id)) return json({ error: "Invalid destination." }, 400);
  const { error } = await db.from("monitoring_destinations").delete().eq("id", id);
  return error ? json({ error: "Unable to remove destination." }, 500) : json({ success: true });
}

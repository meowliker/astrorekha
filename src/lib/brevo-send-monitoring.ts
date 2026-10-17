import { getSupabaseAdmin } from "@/lib/supabase-admin";

// A failed submission is different from a failed read-only health probe. Keep
// the incident until an hour passes without another failed submission.
export async function recordBrevoSendFailure(): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    const { data: previous, error: readError } = await db.from("monitoring_incidents")
      .select("active,opened_at,last_seen_at,last_notified_at").eq("check_key", "brevo_send").maybeSingle();
    if (readError) throw readError;
    const now = new Date().toISOString();
    const continuing = previous?.active && Date.now() - Date.parse(previous.last_seen_at) < 60 * 60_000;
    const { error } = await db.from("monitoring_incidents").upsert({
      check_key: "brevo_send", active: true, status: "warning",
      message: "Brevo did not acknowledge a transactional email submission",
      opened_at: continuing ? previous.opened_at : now,
      last_seen_at: now, resolved_at: null,
      last_notified_at: continuing ? previous.last_notified_at : null,
    }, { onConflict: "check_key" });
    if (error) throw error;
  } catch {
    console.error("[Brevo] Could not record transactional email submission failure");
  }
}

export async function submitBrevoEmail(body: unknown, headers: HeadersInit): Promise<string> {
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null) as { messageId?: string } | null;
    if (!response.ok || !payload?.messageId) throw new Error("Brevo submission was not acknowledged");
    return payload.messageId;
  } catch (cause) {
    await recordBrevoSendFailure();
    throw cause;
  }
}

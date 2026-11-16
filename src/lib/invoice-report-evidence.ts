import type { SupabaseClient } from "@supabase/supabase-js";

const REPORTS = [
  { key: "palmReading", name: "Palm Reading Report", table: "palm_readings", userKey: "id", fields: "id,created_at,reading", content: "reading", path: "/palm-reading" },
  { key: "birthChart", name: "Birth Chart Report", table: "birth_chart_reports", userKey: "user_id", fields: "id,status,created_at,generated_at,sections", content: "sections", path: "/birth-chart" },
  { key: "soulmateSketch", name: "Soulmate Sketch", table: "soulmate_sketches", userKey: "user_id", fields: "id,status,created_at,generated_at,sketch_image_url", content: "sketch_image_url", path: "/soulmate-sketch" },
  { key: "futurePartnerReport", name: "Future Partner Report", table: "future_partner_reports", userKey: "user_id", fields: "id,status,created_at,generated_at,report_data", content: "report_data", path: "/future-partner" },
  { key: "pastLifeReport", name: "Past Life Report", table: "past_life_reports", userKey: "user_id", fields: "id,status,created_at,generated_at,report_data", content: "report_data", path: "/past-life" },
  { key: "auraColorReport", name: "Aura Color Quiz", table: "aura_color_reports", userKey: "user_id", fields: "id,status,created_at,generated_at,result_data,primary_color", content: "result_data", path: "/aura-color" },
] as const;

export type ReportEvidence = {
  key: string; name: string; source: string; recordId: string | null;
  state: string; complete: boolean; accessEnabled: boolean;
  generatedAt: string | null; recordCreatedAt: string | null; checkedAt: string;
  firstPageVisit: { id: string; at: string } | null; pageVisitCount: number;
  generatedBeforePurchase: boolean;
};

export function reportCompletion(row: Record<string, unknown> | null, contentField: string, key: string): boolean {
  if (!row) return false;
  const content = row[contentField];
  const hasContent = typeof content === "string" ? content.trim().length > 0
    : content && typeof content === "object" ? Object.keys(content).length > 0 : false;
  if (key === "palmReading") return Boolean(hasContent);
  return row.status === "complete" && Boolean(hasContent || (key === "auraColorReport" && row.primary_color));
}

export async function getReportEvidence(db: SupabaseClient, userId: string, features: string[], purchasedAt: string, unlocked: Record<string, unknown>): Promise<ReportEvidence[]> {
  const since = Number.isFinite(Date.parse(purchasedAt)) ? purchasedAt : null;
  return Promise.all(REPORTS.filter((spec) => features.includes(spec.name)).map(async (spec) => {
    const record = await db.from(spec.table).select(spec.fields).eq(spec.userKey, userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (record.error) throw new Error(`Unable to verify ${spec.name} records. Please retry.`);
    const row = record.data as Record<string, unknown> | null;
    const complete = reportCompletion(row, spec.content, spec.key);
    const generatedAt = complete && typeof row?.generated_at === "string" ? row.generated_at : null;
    const visits = since ? await db.from("marketing_events").select("id,created_at", { count: "exact" })
      .eq("user_id", userId).eq("event_name", "page_view").eq("path", spec.path)
      .gte("created_at", since).order("created_at", { ascending: true }).limit(1) : null;
    if (visits?.error) throw new Error(`Unable to verify ${spec.name} access records. Please retry.`);
    return {
      key: spec.key, name: spec.name, source: spec.table, recordId: typeof row?.id === "string" ? row.id : null,
      state: complete ? "Completed report saved" : !row ? "No saved report record" : `Saved status: ${String(row.status || "incomplete")}`,
      complete, accessEnabled: unlocked[spec.key] === true,
      generatedAt, recordCreatedAt: typeof row?.created_at === "string" ? row.created_at : null,
      checkedAt: new Date().toISOString(),
      firstPageVisit: visits?.data?.[0] ? { id: visits.data[0].id, at: visits.data[0].created_at } : null,
      pageVisitCount: visits?.count || 0,
      generatedBeforePurchase: Boolean(generatedAt && since && Date.parse(generatedAt) < Date.parse(since)),
    };
  }));
}

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSoulmateSketchJobStatusFromKie } from "@/lib/soulmate-sketch";

export const SKETCH_POLL_INTERVAL_MS = 12_000;
export const SKETCH_STATUS_FIELDS = "id, user_id, status, provider_job_id, sketch_image_url, question_answers, generated_at, generation_count, created_at, updated_at, support_recovery_action_id";
export interface SavedSketch {
  user_id: string;
  status: string;
  provider_job_id?: string | null;
  sketch_image_url?: string | null;
  updated_at?: string | null;
  support_recovery_action_id?: string | null;
  generation_count?: number | null;
  [key: string]: unknown;
}

/** Collect an existing provider job only. Never create jobs, grant access or send purchase events. */
export async function reconcileSoulmateSketch(row: SavedSketch) {
  const result = { sketch: row, providerState: null as string | null, providerDelayed: false, checked: false };
  if (row.support_recovery_action_id || row.status !== "generating" || !row.provider_job_id || row.sketch_image_url) return result;
  if (row.updated_at && Date.now() - Date.parse(row.updated_at) < SKETCH_POLL_INTERVAL_MS) return result;

  const job = await getSoulmateSketchJobStatusFromKie(row.provider_job_id);
  result.checked = true;
  result.providerState = job.state;
  const created = Number((job.raw as {data?: {createTime?: number}})?.data?.createTime);
  result.providerDelayed = Number.isFinite(created) && created > 0 && Date.now() - created > 120_000;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (job.state === "success" && job.imageUrl) {
    Object.assign(patch, { status: "complete", sketch_image_url: job.imageUrl,
      generated_at: new Date().toISOString(), generation_count: Math.max(1, row.generation_count || 0) });
  } else if (job.state === "fail" || job.state === "failed") {
    patch.status = "failed";
  }
  // A late poll must not replace a newer job, support correction, or completed image.
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("soulmate_sketches").update(patch)
    .eq("user_id", row.user_id).eq("provider_job_id", row.provider_job_id)
    .eq("status", "generating").is("support_recovery_action_id", null)
    .select(SKETCH_STATUS_FIELDS).maybeSingle();
  if (error) throw new Error("Unable to save sketch progress");
  if (data) return { ...result, sketch: data as SavedSketch };
  const latest = await db.from("soulmate_sketches").select(SKETCH_STATUS_FIELDS).eq("user_id", row.user_id).maybeSingle();
  if (latest.error) throw new Error("Unable to load sketch progress");
  return { ...result, sketch: (latest.data || row) as SavedSketch };
}

export async function collectPendingSoulmateSketches() {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("soulmate_sketches").select(SKETCH_STATUS_FIELDS)
    .eq("status", "generating").is("support_recovery_action_id", null)
    .not("provider_job_id", "is", null)
    .lt("updated_at", new Date(Date.now() - SKETCH_POLL_INTERVAL_MS).toISOString())
    .order("updated_at", { ascending: true }).limit(20);
  if (error) throw new Error("Unable to load pending sketches");
  const totals = { checked: 0, complete: 0, failed: 0, pending: 0, errors: 0 };
  for (const row of data || []) {
    try {
      const result = await reconcileSoulmateSketch(row);
      if (result.checked) totals.checked++;
      if (result.sketch.status === "complete") totals.complete++;
      else if (result.sketch.status === "failed") totals.failed++;
      else totals.pending++;
    } catch { totals.errors++; }
  }
  return totals;
}

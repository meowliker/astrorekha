import { usSoulmateAutomation } from "./us-soulmate-automation";
import crypto from "node:crypto";
import sharp from "sharp";
import { getSupabaseAdmin } from "./supabase-admin";
import { advanceReportPreparation, initialPreparation, type PreparationState, type PreparedAsset } from "./us-soulmate-report-preparation";
import { assertPreparationOrder, buildReportPlan, descriptionSections, indiaDate, orderFingerprint, validateDescription, type PreparationOrder } from "./us-soulmate-report-plan";
import { timelineFingerprint, validateTimeline } from "./us-soulmate-timeline";
import { generateReportDescription, generateReportTimeline, pollReportSketch, submitReportSketch, assertReportCredentials } from "./us-soulmate-report-providers";
import { checkPreparedPdf, deterministicReportIssues, parseProviderJson, reportContentFingerprint, type QualityIssue, type QualityResult } from "./us-soulmate-report-quality";

const BUCKET = "us-soulmate-sketches-private";
type Asset = PreparedAsset & { storagePath: string };
export type AutomaticReportState = Omit<PreparationState, "assets"> & {
  startedAt: string; imagePath?: string; assets?: Asset[];
  repairs?: Partial<Record<"description" | "timeline", number>>;
  feedback?: Partial<Record<"description" | "timeline", string>>;
  quality?: QualityResult;
};
type Job = { order_id: string; answer_revision: number; lease_id: string; state: AutomaticReportState | null; failures: number };
const digest = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

/** One bounded repair per purchased text report; never create another image job. */
export function repairReportState(s: AutomaticReportState, issues: QualityIssue[]): AutomaticReportState {
  if (issues.some(i => i.kind === "sketch")) throw new Error("Sketch failed local checks; manual attention required");
  const kinds = [...new Set(issues.map(i => i.kind))] as ("description" | "timeline")[];
  if (!kinds.length) throw new Error("Missing repair findings");
  const next = { ...s, quality: undefined, assets: undefined, repairs: { ...s.repairs }, feedback: { ...s.feedback } };
  for (const kind of kinds) {
    if (!s.plan[kind] || (s.repairs?.[kind] || 0) >= 1) throw new Error(`${kind} still fails local checks after repair; manual attention required`);
    next.repairs[kind] = (s.repairs?.[kind] || 0) + 1;
    next.feedback[kind] = issues.filter(i => i.kind === kind).map(i => i.reason).join("\n").slice(0, 6000);
    delete next[kind];
    if (kind === "description") delete next.descriptionRaw;
    else delete next.timelineRaw;
  }
  if (kinds.includes("description")) {
    // A revised description is the source of truth for the timeline, so rebuild it as well.
    delete next.timeline; delete next.timelineRaw; delete next.timelineSource;
    next.stage = "sketch_ready";
  } else next.stage = "description_ready";
  return next;
}

export async function processAutomaticReportJob(job: Job) {
  const db = getSupabaseAdmin({ fresh: true });
  let state = job.state;
  const assets = new Map<string, Asset>(state?.assets?.map(a => [a.kind, a]) || []);
  async function currentOrder(): Promise<PreparationOrder> {
    const { data, error } = await db.from("us_soulmate_orders").select("id,catalog_version,payment_status,review_status,answer_revision,answers,entitlements,scheduled_send_at,fulfillment_status").eq("id", job.order_id).single();
    if (error || !data || data.answer_revision !== job.answer_revision) throw new Error("Order answers changed or order is unavailable");
    return data as PreparationOrder;
  }
  async function storePrivate(path: string, bytes: Buffer, contentType: string) {
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw new Error("Private report storage unavailable");
  }
  async function checkpoint(s: PreparationState, release = false, error: string | null = null, hold = false) {
    state = { ...state, ...s } as AutomaticReportState;
    if (state.image) {
      const path = `${job.order_id}/auto-r${job.answer_revision}/${state.image.sha256}.jpg`;
      if (state.imagePath !== path) {
        const bytes = Buffer.from(state.image.base64, "base64");
        if (digest(bytes) !== state.image.sha256) throw new Error("Sketch checksum mismatch");
        await storePrivate(path, bytes, state.image.contentType);
        state.imagePath = path;
      }
    }
    if (s.assets) state.assets = s.assets.map(a => ({ ...a, storagePath: assets.get(a.kind)?.storagePath || (a as Asset).storagePath }));
    const stored = { ...state, image: state.image ? { ...state.image, base64: undefined } : undefined };
    const { error: err } = await db.rpc("checkpoint_us_soulmate_reports", { p_order: job.order_id, p_revision: job.answer_revision,
      p_lease: job.lease_id, p_state: stored, p_release: release, p_error: error, p_hold: hold });
    if (err) throw new Error("Preparation checkpoint rejected: order changed or lease expired");
  }
  async function saveAsset(asset: PreparedAsset, bytes: Buffer) {
    checkPreparedPdf(asset.kind, bytes);
    const storagePath = `${job.order_id}/auto-r${job.answer_revision}/${asset.sha256}.pdf`;
    await storePrivate(storagePath, bytes, "application/pdf");
    assets.set(asset.kind, { ...asset, storagePath });
  }
  try {
    const order = await currentOrder();
    assertPreparationOrder(order);
    if (!state) state = { ...initialPreparation(order), assets: undefined, startedAt: new Date().toISOString() };
    if (state.plan.fingerprint !== orderFingerprint(order)) throw new Error("Preparation fingerprint no longer matches the order");
    if (state.image && state.imagePath) {
      if (!state.imagePath.startsWith(`${job.order_id}/auto-r${job.answer_revision}/`)) throw new Error("Invalid private sketch path");
      const { data, error } = await db.storage.from(BUCKET).download(state.imagePath);
      if (error || !data) throw new Error("Prepared sketch is unavailable");
      const bytes = Buffer.from(await data.arrayBuffer());
      if (digest(bytes) !== state.image.sha256) throw new Error("Prepared sketch checksum mismatch");
      state.image.base64 = bytes.toString("base64");
    }
    // If a process ended after receiving Claude's response, recover it without another billable call.
    for (const kind of ["description", "timeline"] as const) {
      if (state.stage !== `${kind}_submitting`) continue;
      const raw = kind === "description" ? state.descriptionRaw : state.timelineRaw;
      if (!raw) throw new Error("Provider request outcome is uncertain; inspect before retrying");
      try {
        const parsed = parseProviderJson(raw);
        state[kind] = { report: kind === "description" ? validateDescription(parsed.value) : validateTimeline(parsed.value), model: parsed.model, requestId: parsed.requestId, usage: parsed.usage };
        state.stage = kind === "description" ? "description_ready" : "timeline_ready";
        await checkpoint(state, true);
        return "recovered";
      } catch (error) {
        state = repairReportState(state, [{ kind, reason: error instanceof Error ? error.message : "Invalid report" }]);
        await checkpoint(state, true);
        return "repair_queued";
      }
    }
    if (state.stage === "sketch_submitting") throw new Error("Image submission outcome is uncertain; inspect the existing Kie request before retrying");
    if (state.stage === "sketch_generating" && Date.now() - new Date(state.startedAt).getTime() > 2 * 60 * 60 * 1000) throw new Error("Sketch provider has not completed within two hours; inspect the saved task");
    // Prose dates are prohibited. Re-anchor the deterministic month labels before rendering if delayed.
    if (state.image && indiaDate(new Date()) > state.plan.referenceDay) {
      state.plan = buildReportPlan(order);
      if (state.timeline && state.description) state.timelineSource = timelineFingerprint({ ...state.plan, descriptionText: JSON.stringify({ sections: descriptionSections(state.plan, state.description.report), closing: state.description.report.closing }) }, Buffer.from(state.image.base64, "base64"));
      state.quality = undefined; state.assets = undefined;
      if (state.stage === "prepared") state.stage = state.timeline ? "timeline_ready" : state.description ? "description_ready" : "sketch_ready";
    }
    if (state.stage === "prepared") {
      const issues = deterministicReportIssues(state);
      if (issues.length) {
        state = repairReportState(state, issues);
        await checkpoint(state, true);
        return "repair_queued";
      }
      if (!state.assets || state.assets.reduce((total, a) => total + a.size, 0) > 7 * 1024 * 1024) throw new Error("Missing or oversized attachment set");
      for (const asset of state.assets) {
        const { data, error } = await db.storage.from(BUCKET).download(asset.storagePath);
        if (error || !data) throw new Error("Prepared attachment is unavailable");
        const bytes = Buffer.from(await data.arrayBuffer());
        if (bytes.length !== asset.size || digest(bytes) !== asset.sha256) throw new Error("Prepared PDF checksum mismatch");
        checkPreparedPdf(asset.kind, bytes);
      }
      state.quality = { passed: true, issues: [], fingerprint: reportContentFingerprint(state), model: "local-checks-v1" };
      await checkpoint(state);
      const { error } = await db.rpc("finish_us_soulmate_reports", { p_order: job.order_id, p_revision: job.answer_revision, p_lease: job.lease_id });
      if (error) throw new Error("Final approval rejected: snapshot changed or attachments are incomplete");
      return "ready";
    }
    const activeState = state;
    const next = await advanceReportPreparation(state, { currentOrder, checkpoint, saveAsset }, { execute: true, providers: {
      submit: submitReportSketch,
      poll: async id => {
        const result = await pollReportSketch(id);
        if (result && !activeState.plan.profile.colour) {
          result.buffer = await sharp(result.buffer).grayscale().jpeg({ quality: 90 }).toBuffer();
        }
        return result;
      },
      describe: (plan, image, type, raw) => generateReportDescription(plan, image, type, raw, activeState.feedback?.description),
      timeline: (context, image, type, raw) => generateReportTimeline(context, image, type, raw, activeState.feedback?.timeline),
    } });
    await checkpoint(next, true);
    return next.stage;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report preparation failed";
    // A complete response is recoverable on the next run; uncertain POSTs are never automatically repeated.
    const recoverable = state && ((state.stage === "description_submitting" && state.descriptionRaw) || (state.stage === "timeline_submitting" && state.timelineRaw));
    const safePollRetry = state?.stage === "sketch_generating" && /status unavailable|fetch failed|timeout/i.test(message) && job.failures < 4;
    if (state) {
      // Rendering overflow is repaired as text, without spending credits on a new portrait.
      const layout = message.match(/^(description|timeline) PDF exceeds/);
      if (layout) {
        try { state = repairReportState(state, [{ kind: layout[1] as "description" | "timeline", reason: message }]); await checkpoint(state, true); return "repair_queued"; } catch { /* hold below */ }
      }
      try { await checkpoint(state, true, message, !recoverable && !safePollRetry); }
      catch { return "stale_or_unavailable"; } // Never overwrite a new revision or another worker's lease.
    } else {
      // Invalid paid snapshots must be visible as held, not retried forever without a state.
      const { error: holdError } = await db.rpc("checkpoint_us_soulmate_reports", { p_order: job.order_id, p_revision: job.answer_revision,
        p_lease: job.lease_id, p_state: null, p_release: true, p_error: message, p_hold: true });
      if (holdError) return "stale_or_unavailable";
    }
    return recoverable || safePollRetry ? "retry_pending" : "needs_review";
  }
}
export async function runAutomaticSoulmateReports() {
  if (!usSoulmateAutomation.reportsEnabled || process.env.VERCEL_ENV !== "production") return { enabled: false, processed: 0 };
  const mode = "live";
  assertReportCredentials(true);
  const db = getSupabaseAdmin({ fresh: true });
  const { data, error } = await db.rpc("claim_us_soulmate_report_jobs", { p_mode: mode, p_limit: 2 });
  if (error) throw new Error("Report queue unavailable");
  const results = await Promise.all((data as Job[] || []).map(processAutomaticReportJob));
  const { count, error: countError } = await db.from("us_soulmate_report_jobs")
    .select("order_id,us_soulmate_orders!inner(review_status,payment_status,payment_mode)", { count: "exact", head: true })
    .eq("status", "needs_review").eq("us_soulmate_orders.review_status", "pending")
    .eq("us_soulmate_orders.payment_status", "paid").eq("us_soulmate_orders.payment_mode", mode);
  return { enabled: true, processed: results.length, results, needsReview: count || 0, failed: Boolean(countError) || results.includes("stale_or_unavailable") };
}

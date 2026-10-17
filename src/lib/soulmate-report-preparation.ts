import crypto from "node:crypto";
import { assertPreparationOrder, buildReportPlan, descriptionSections, indiaDate, orderFingerprint, type PreparationOrder, type ReportPlan, type DescriptionDraft } from "./soulmate-report-plan";
import { renderSketchPdf, renderDescriptionPdf, renderTimelinePdf } from "./soulmate-report-pdf";
import { assertReportCredentials, submitReportSketch, pollReportSketch, generateReportDescription, generateReportTimeline } from "./soulmate-report-providers";
import { timelineFingerprint, type TimelineContext, type TimelineDraft } from "./soulmate-timeline";

export type PreparedAsset = { kind: "sketch" | "description" | "timeline"; filename: string; sha256: string; size: number };
export type PreparationState = {
  stage: "planned" | "sketch_submitting" | "sketch_generating" | "sketch_ready" | "description_submitting" | "description_ready" | "timeline_submitting" | "timeline_ready" | "prepared";
  plan: ReportPlan; taskId?: string; image?: { base64: string; contentType: string; sha256: string };
  description?: { report: DescriptionDraft; model: string; requestId: string; usage: unknown };
  descriptionRaw?: unknown;
  timeline?: { report: TimelineDraft; model: string; requestId: string; usage: unknown };
  timelineSource?: string;
  timelineRaw?: unknown;
  assets?: PreparedAsset[];
};
const providers = { submit: submitReportSketch, poll: pollReportSketch, describe: generateReportDescription, timeline: generateReportTimeline };
type PreparationIO = {
  // Callers must hold an exclusive order/revision lock. Checkpoint writes must be atomic.
  currentOrder(): Promise<PreparationOrder>;
  checkpoint(state: PreparationState): Promise<void>;
  saveAsset(asset: PreparedAsset, bytes: Buffer): Promise<void>;
};
export function initialPreparation(order: PreparationOrder, now = new Date()): PreparationState {
  return { stage: "planned", plan: buildReportPlan(order, now) };
}
/** One resumable step. No database mutations, attachment registration, approval or email. */
export async function advanceReportPreparation(state: PreparationState, io: PreparationIO, options: {
  execute?: boolean; now?: Date; providers?: typeof providers;
} = {}) {
  if (options.execute !== true) throw new Error("Automatic preparation is disabled; explicit execution is required");
  const now = options.now || new Date();
  const api = options.providers || providers;
  async function current() {
    const order = await io.currentOrder();
    assertPreparationOrder(order);
    if (state.plan.fingerprint !== orderFingerprint(order)) throw new Error("Answers or purchases changed; start a new preparation using the latest revision");
    return order;
  }
  await current();
  if (state.stage === "prepared") {
    if (indiaDate(now) <= state.plan.referenceDay) return state;
    if (state.plan.timeline) throw new Error("Timeline dates need joint review with the description before preparing a later delivery");
    // A later preview re-renders future dates without another billable request.
    state = { ...state, stage: state.description ? "description_ready" : "sketch_ready" };
  }
  if (["sketch_submitting", "description_submitting", "timeline_submitting"].includes(state.stage)) throw new Error("Previous provider request has an uncertain outcome; inspect it before any retry");
  if (!options.providers && ["planned", "sketch_generating", "sketch_ready"].includes(state.stage)) assertReportCredentials(state.plan.description);
  const save = async (patch: Partial<PreparationState>) => { state = { ...state, ...patch }; await io.checkpoint(state); return state; };
  if (state.stage === "planned") {
    await save({ stage: "sketch_submitting" }); // Persist BEFORE a billable external POST.
    const taskId = await api.submit(state.plan);
    return save({ stage: "sketch_generating", taskId });
  }
  if (state.stage === "sketch_generating") {
    if (!state.taskId) throw new Error("Missing saved provider task");
    const image = await api.poll(state.taskId);
    if (!image) return state;
    await current();
    return save({ stage: "sketch_ready", image: { base64: image.buffer.toString("base64"), contentType: image.contentType, sha256: crypto.createHash("sha256").update(image.buffer).digest("hex") } });
  }
  if (!state.image) throw new Error("Missing prepared sketch");
  const image = Buffer.from(state.image.base64, "base64");
  if (crypto.createHash("sha256").update(image).digest("hex") !== state.image.sha256) throw new Error("Prepared sketch checksum mismatch");
  if (state.stage === "sketch_ready" && state.plan.description) {
    // Re-anchor timing to the actual date of writing, not the original purchase date.
    const updated = buildReportPlan(await current(), now);
    await save({ stage: "description_submitting", plan: updated });
    const description = await api.describe(updated, image, state.image.contentType, async payload => { await save({ descriptionRaw: payload }); });
    await current();
    return save({ stage: "description_ready", description });
  }
  if (state.plan.description && !state.description) throw new Error("Missing purchased description");
  if (indiaDate(now) > state.plan.referenceDay) {
    if (state.timeline) throw new Error("Timeline dates need joint review with the description");
    // Prose contains no dates. Rebuild only the deterministic timing section if render was delayed.
    await save({ plan: buildReportPlan(await current(), now) });
  }
  let context: TimelineContext | undefined;
  if (state.plan.timeline) {
    if (!state.description) throw new Error("Timeline requires the matching description");
    context = { ...state.plan, descriptionText: JSON.stringify({ sections: descriptionSections(state.plan, state.description.report), closing: state.description.report.closing }) };
    const source = timelineFingerprint(context, image);
    if (!state.timeline) {
      await save({ stage: "timeline_submitting", timelineSource: source });
      const timeline = await api.timeline(context, image, state.image.contentType, async payload => { await save({ timelineRaw: payload }); });
      await current();
      return save({ stage: "timeline_ready", timeline });
    }
    if (state.timelineSource !== source) throw new Error("Timeline source changed; review before rendering");
  }
  const files: { kind: PreparedAsset["kind"]; bytes: Buffer }[] = [
    { kind: "sketch", bytes: renderSketchPdf(image, state.image.contentType === "image/png" ? "PNG" : "JPEG") },
    ...(state.plan.description ? [{ kind: "description" as const, bytes: renderDescriptionPdf(state.plan, state.description!.report) }] : []),
    ...(context ? [{ kind: "timeline" as const, bytes: renderTimelinePdf(context, state.timeline!.report, now) }] : []),
  ];
  const assets: PreparedAsset[] = [];
  for (const file of files) {
    if (file.bytes.length > 3 * 1024 * 1024) throw new Error("Prepared PDF exceeds private asset size limit");
    const asset = { kind: file.kind, filename: `AstroRekha-${file.kind}-${state.plan.orderId}.pdf`, size: file.bytes.length, sha256: crypto.createHash("sha256").update(file.bytes).digest("hex") };
    await current();
    await io.saveAsset(asset, file.bytes);
    assets.push(asset);
  }
  await current();
  return save({ stage: "prepared", assets });
}

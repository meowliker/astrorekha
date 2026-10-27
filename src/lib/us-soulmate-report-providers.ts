import { downloadImage } from "./us-soulmate-fulfillment";
import sharp from "sharp";
import { descriptionPrompt, validateDescription, type ReportPlan } from "./us-soulmate-report-plan";
import { assertTimelineContext, timelinePrompt, validateTimeline, type TimelineContext } from "./us-soulmate-timeline";

// Dedicated Soulmate credentials only. Never fall back to the original app's keys.
function key(name: "US_SOULMATE_KIE_API_KEY" | "US_SOULMATE_ANTHROPIC_API_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
export function assertReportCredentials(description: boolean) {
  key("US_SOULMATE_KIE_API_KEY");
  if (description) key("US_SOULMATE_ANTHROPIC_API_KEY");
}
export async function normalizeReportImage(buffer: Buffer) {
  const metadata = await sharp(buffer, { limitInputPixels: 20000000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 1024 || metadata.height < 1024 || Math.abs(metadata.width / metadata.height - 1) > 0.02) throw new Error("Generated sketch has invalid dimensions");
  for (const quality of [90, 85, 80]) {
    const compressed = await sharp(buffer).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (compressed.length <= 2800000) return { buffer: compressed, contentType: "image/jpeg", extension: "jpg" };
  }
  throw new Error("Sketch could not fit the attachment limit at acceptable quality");
}
export async function submitReportSketch(plan: ReportPlan) {
  const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key("US_SOULMATE_KIE_API_KEY")}` },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: "nano-banana-2", input: { prompt: plan.sketchPrompt, aspect_ratio: "1:1", resolution: "2K", output_format: "jpg", google_search: false, image_input: [] } }),
  });
  const payload = await response.json();
  if (!response.ok || payload.code !== 200 || typeof payload.data?.taskId !== "string" || !payload.data.taskId) throw new Error("Kie submission outcome unknown; inspect the saved request before retrying");
  return payload.data.taskId as string;
}
export class SoulmateSketchFailure extends Error {
  constructor(readonly taskId: string, readonly code: string, readonly retryable: boolean) {
    super(`Kie generation failed (${code || "unknown"}): ${retryable ? "provider timeout" : "provider rejected the task; manual review required"}`);
  }
}
export async function pollReportSketch(taskId: string) {
  if (!taskId || taskId.length > 200) throw new Error("Invalid saved Kie task ID");
  const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key("US_SOULMATE_KIE_API_KEY")}` }, cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Kie status unavailable; retry polling the same task");
  const payload = await response.json();
  if (payload.code !== 200 || !payload.data) throw new Error("Kie status unavailable");
  if (payload.data.state === "fail") {
    const code = String(payload.data.failCode || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    // Only a confirmed terminal timeout permits a replacement task. Unknown
    // submissions, refusals and pending tasks must never create a second charge.
    throw new SoulmateSketchFailure(taskId, code, ["408", "504", "524"].includes(code));
  }
  if (payload.data.state !== "success") return null;
  const result = JSON.parse(payload.data.resultJson);
  if (!Array.isArray(result.resultUrls) || result.resultUrls.length !== 1 || typeof result.resultUrls[0] !== "string") throw new Error("Expected one generated portrait");
  const image = await downloadImage(result.resultUrls[0]);
  if (image.contentType !== "image/jpeg" && image.contentType !== "image/png") throw new Error("Expected JPEG or PNG sketch");
  return normalizeReportImage(image.buffer);
}
export async function generateReportDescription(plan: ReportPlan, image: Buffer, contentType: string, checkpointRaw?: (payload: unknown) => Promise<void>, feedback?: string) {
  if (!plan.description) throw new Error("Description was not purchased");
  if (!["image/jpeg", "image/png"].includes(contentType) || image.length > 3 * 1024 * 1024) throw new Error("Invalid reference sketch");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key("US_SOULMATE_ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4500,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: contentType, data: image.toString("base64") } },
        { type: "text", text: descriptionPrompt(plan) + (feedback ? `\nRevise the complete report to resolve these quality findings. Keep the required JSON schema and every original instruction:\n${feedback.slice(0, 6000)}` : "") },
      ] }],
    }),
  });
  if (!response.ok) throw new Error(`Claude description request failed (${response.status}); no automatic retry`);
  const payload = await response.json();
  if (checkpointRaw) await checkpointRaw(payload);
  if (payload.stop_reason !== "end_turn" || !Array.isArray(payload.content)) throw new Error("Description was truncated or refused");
  const raw = payload.content.filter((part: { type: string }) => part.type === "text").map((part: { text: string }) => part.text).join("").replace(/^```(?:json)?\s*|\s*```$/g, "");
  return { report: validateDescription(JSON.parse(raw)), model: payload.model, requestId: payload.id, usage: payload.usage };
}

// Explicit callers only; no registration, approval, delivery or automatic retry.
export async function generateReportTimeline(context: TimelineContext, image: Buffer, contentType: string, checkpointRaw?: (payload: unknown) => Promise<void>, feedback?: string) {
  assertTimelineContext(context);
  if (!["image/jpeg", "image/png"].includes(contentType) || image.length > 3 * 1024 * 1024) throw new Error("Invalid reference sketch");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key("US_SOULMATE_ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4500,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: contentType, data: image.toString("base64") } },
        { type: "text", text: timelinePrompt(context) + (feedback ? `\nRevise the complete report to resolve these quality findings. Keep the required JSON schema and every original instruction:\n${feedback.slice(0, 6000)}` : "") },
      ] }],
    }),
  });
  if (!response.ok) throw new Error(`Claude timeline request failed (${response.status}); no automatic retry`);
  const payload = await response.json();
  if (checkpointRaw) await checkpointRaw(payload);
  if (payload.stop_reason !== "end_turn" || !Array.isArray(payload.content)) throw new Error("Timeline was truncated or refused");
  const raw = payload.content.filter((part: { type: string }) => part.type === "text").map((part: { text: string }) => part.text).join("").replace(/^```(?:json)?\s*|\s*```$/g, "");
  return { report: validateTimeline(JSON.parse(raw)), model: payload.model, requestId: payload.id, usage: payload.usage };
}

import type { LayoutBFunnelConfig } from "@/lib/layout-b-funnel";

export type SketchAnswers = Record<string, string>;

export interface SketchGenerationResult {
  imageUrl: string;
  providerJobId?: string | null;
  raw?: any;
}

const DEFAULT_KIE_BASE_URL = "https://api.kie.ai";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractImageUrl(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.image_url === "string" && payload.image_url) return payload.image_url;
  if (typeof payload.url === "string" && payload.url) return payload.url;
  if (typeof payload.output_url === "string" && payload.output_url) return payload.output_url;
  if (Array.isArray(payload.images) && payload.images[0]) {
    const first = payload.images[0];
    if (typeof first === "string") return first;
    if (typeof first?.url === "string") return first.url;
  }
  if (Array.isArray(payload.data) && payload.data[0]) {
    const first = payload.data[0];
    if (typeof first?.url === "string") return first.url;
    if (typeof first?.b64_json === "string") {
      return `data:image/png;base64,${first.b64_json}`;
    }
  }
  return null;
}

export function buildSoulmateSketchPrompt(answers: SketchAnswers, profile: any) {
  const name = profile?.name || "this user";
  const sunSign =
    (typeof profile?.sun_sign === "string" ? profile.sun_sign : profile?.sun_sign?.name) || "unknown";

  const compactAnswers = Object.entries(answers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

  return [
    "Create a high-quality black-and-white pencil sketch portrait of a soulmate.",
    "The style should be realistic, romantic, and softly lit. Face centered.",
    "No text, no watermark, no extra hands, no collage, no multiple faces.",
    "Single person portrait only.",
    `Reference profile: name=${name}, sun_sign=${sunSign}.`,
    `User preference hints: ${compactAnswers || "not provided"}.`,
  ].join(" ");
}

export async function generateSoulmateSketchFromKie({
  prompt,
  config,
}: {
  prompt: string;
  config: LayoutBFunnelConfig;
}): Promise<SketchGenerationResult> {
  const apiKey = process.env.KIE_API_KEY;
  const baseUrl = (process.env.KIE_API_BASE_URL || DEFAULT_KIE_BASE_URL).replace(/\/$/, "");
  const createPath = process.env.KIE_NANO_BANANA_CREATE_PATH || "/v1/nano-banana-2/generate";
  const statusPathTemplate = process.env.KIE_JOB_STATUS_PATH_TEMPLATE || "/v1/jobs/{job_id}";

  if (!apiKey) {
    throw new Error("Missing KIE_API_KEY");
  }

  const createRes = await fetch(`${baseUrl}${createPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "nano-banana-2",
      prompt,
      style: "pencil-sketch",
      quality: "high",
      response_format: "url",
      max_outputs: Math.max(1, config.maxSketchPerUser),
    }),
  });

  const createPayload = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    throw new Error(createPayload?.message || createPayload?.error || "Kie.ai request failed");
  }

  const immediateUrl = extractImageUrl(createPayload);
  if (immediateUrl) {
    return {
      imageUrl: immediateUrl,
      providerJobId: createPayload?.job_id || createPayload?.id || null,
      raw: createPayload,
    };
  }

  const jobId = createPayload?.job_id || createPayload?.id;
  if (!jobId) {
    throw new Error("Kie.ai response did not include image URL or job id");
  }

  const statusPath = statusPathTemplate.replace("{job_id}", jobId);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(2000);
    const statusRes = await fetch(`${baseUrl}${statusPath}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });
    const statusPayload = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) {
      continue;
    }

    const url = extractImageUrl(statusPayload);
    if (url) {
      return {
        imageUrl: url,
        providerJobId: jobId,
        raw: statusPayload,
      };
    }
  }

  throw new Error("Timed out waiting for Kie.ai sketch result");
}

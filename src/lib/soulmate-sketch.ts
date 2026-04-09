import type { LayoutBFunnelConfig } from "@/lib/layout-b-funnel";

export type SketchAnswers = Record<string, string>;

export interface SketchGenerationResult {
  imageUrl: string;
  providerJobId?: string | null;
  raw?: any;
}

export interface KieJobStatusResult {
  state: string;
  imageUrl?: string | null;
  raw?: any;
  failMessage?: string | null;
}

export class KieTimeoutError extends Error {
  jobId: string;

  constructor(message: string, jobId: string) {
    super(message);
    this.name = "KieTimeoutError";
    this.jobId = jobId;
  }
}

const DEFAULT_KIE_BASE_URL = "https://api.kie.ai";
const DEFAULT_CREATE_PATH = "/api/v1/jobs/createTask";
const DEFAULT_STATUS_PATH_TEMPLATE = "/api/v1/jobs/recordInfo?taskId={job_id}";
const DEFAULT_INITIAL_POLL_ATTEMPTS = 8;
const DEFAULT_INITIAL_POLL_INTERVAL_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function extractImageUrl(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.image_url === "string" && payload.image_url) return payload.image_url;
  if (typeof payload.url === "string" && payload.url) return payload.url;
  if (typeof payload.output_url === "string" && payload.output_url) return payload.output_url;
  if (typeof payload.resultJson === "string") {
    try {
      const parsed = JSON.parse(payload.resultJson);
      if (Array.isArray(parsed?.resultUrls) && typeof parsed.resultUrls[0] === "string") {
        return parsed.resultUrls[0];
      }
    } catch {
      // ignore parse error
    }
  }
  if (typeof payload?.data?.resultJson === "string") {
    try {
      const parsed = JSON.parse(payload.data.resultJson);
      if (Array.isArray(parsed?.resultUrls) && typeof parsed.resultUrls[0] === "string") {
        return parsed.resultUrls[0];
      }
    } catch {
      // ignore parse error
    }
  }
  if (Array.isArray(payload?.data?.resultUrls) && typeof payload.data.resultUrls[0] === "string") {
    return payload.data.resultUrls[0];
  }
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

function extractProviderErrorMessage(payload: any): string | null {
  const candidates = [
    payload?.message,
    payload?.error,
    payload?.detail,
    payload?.msg,
    payload?.data?.message,
    payload?.data?.error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized && normalized.toLowerCase() !== "no message available") {
        return normalized;
      }
    }
  }

  return null;
}

function getKieRuntimeConfig() {
  const apiKey = process.env.KIE_API_KEY;
  const baseUrl = (process.env.KIE_API_BASE_URL || DEFAULT_KIE_BASE_URL).replace(/\/$/, "");
  const createPath = process.env.KIE_NANO_BANANA_CREATE_PATH || DEFAULT_CREATE_PATH;
  const statusPathTemplate = process.env.KIE_JOB_STATUS_PATH_TEMPLATE || DEFAULT_STATUS_PATH_TEMPLATE;
  const initialPollAttempts = parsePositiveInt(
    process.env.KIE_INITIAL_POLL_ATTEMPTS,
    DEFAULT_INITIAL_POLL_ATTEMPTS
  );
  const initialPollIntervalMs = parsePositiveInt(
    process.env.KIE_INITIAL_POLL_INTERVAL_MS,
    DEFAULT_INITIAL_POLL_INTERVAL_MS
  );
  return {
    apiKey,
    baseUrl,
    createPath,
    statusPathTemplate,
    initialPollAttempts,
    initialPollIntervalMs,
  };
}

export async function getSoulmateSketchJobStatusFromKie(jobId: string): Promise<KieJobStatusResult> {
  const { apiKey, baseUrl, statusPathTemplate } = getKieRuntimeConfig();
  if (!apiKey) {
    throw new Error("Missing KIE_API_KEY");
  }

  const statusPath = statusPathTemplate.replace("{job_id}", jobId);
  const statusRes = await fetch(`${baseUrl}${statusPath}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
  const statusPayload = await statusRes.json().catch(() => ({}));

  if (!statusRes.ok) {
    console.error("[soulmate-sketch/kie] status failed", {
      status: statusRes.status,
      statusText: statusRes.statusText,
      jobId,
      payload: statusPayload,
    });
    throw new Error(`Kie status request failed (${statusRes.status})`);
  }

  const taskState = String(statusPayload?.data?.state || statusPayload?.state || "").toLowerCase();
  const url = extractImageUrl(statusPayload);
  const failMessage = extractProviderErrorMessage(statusPayload) || statusPayload?.data?.failMsg || null;

  return {
    state: taskState || "unknown",
    imageUrl: url,
    raw: statusPayload,
    failMessage,
  };
}

export function buildSoulmateSketchPrompt(answers: SketchAnswers, profile: any) {
  // Mapping logic adapted from prompts/soulmate_sketch_prompt.txt
  const genderInput = String(answers.attracted_to || "").toLowerCase();
  const ageRange = String(answers.age_group || "25-30");
  const vibeInput = String(answers.vibe || "elegant").toLowerCase();

  const profileGender = String(profile?.gender || "").toLowerCase();
  const genderMap: Record<string, string> = {
    female: "woman",
    male: "man",
    any: profileGender === "female" ? "woman" : profileGender === "male" ? "man" : "person",
  };

  // India-only rollout: keep appearance fixed and explicitly include Indian + Asian keywords.
  const appearanceText = "Indian, South Asian / Asian features, warm brown skin, large dark eyes, defined brows";

  const vibeMap: Record<string, string> = {
    cute: "soft round features, gentle smile, warm kind eyes, youthful glow, dimples",
    bold: "sharp jawline, high cheekbones, intense confident gaze, strong defined features",
    elegant: "graceful neck, poised expression, refined delicate features, subtle smile",
    mysterious: "deep soulful eyes, slight smirk, shadowed contours, enigmatic expression, tousled hair",
  };

  const ageMap: Record<string, string> = {
    "20-25": "youthful, fresh-faced",
    "25-30": "young adult",
    "30-35": "early thirties, mature attractiveness",
    "35-40": "mid thirties, refined maturity",
    "40-45": "early forties, distinguished, subtle laugh lines",
    "45-50": "late forties, seasoned elegance, silver-touched hair",
    "50+": "fifties, dignified beauty, graceful aging, wisdom in eyes",
  };

  const genderText = genderMap[genderInput] || "person";
  const vibeText = vibeMap[vibeInput] || vibeMap.elegant;
  const ageText = ageMap[ageRange] || ageMap["25-30"];
  const selectedWorries = String(answers.main_worry || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replaceAll("_", " "));
  const selectedFutureGoals = String(answers.future_goal || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replaceAll("_", " "));

  const negativePrompt =
    "cartoon, anime, 3d render, painting, watercolor, color, colorful, blurry, deformed, ugly, disfigured, extra fingers, extra limbs, mutated, bad anatomy, bad proportions, text, watermark, signature, frame, border, low quality, worst quality, jpeg artifacts, cropped, out of frame, duplicate, multiple faces, two people";

  return [
    `Pencil sketch portrait of a young ${genderText}, age ${ageRange}, ${ageText}, ${appearanceText}, ${vibeText}, artistic charcoal sketch style on aged cream paper, soft romantic lighting, detailed realistic hair, black and white pencil drawing, no color, high detail face, portrait orientation, clean background.${selectedWorries.length ? ` Emotional undertone to reflect: ${selectedWorries.join(", ")}.` : ""}${selectedFutureGoals.length ? ` Relationship aspiration vibe: ${selectedFutureGoals.join(", ")}.` : ""}`,
    `Avoid: ${negativePrompt}.`,
  ].join(" ");
}

export async function generateSoulmateSketchFromKie({
  prompt,
  config,
}: {
  prompt: string;
  config: LayoutBFunnelConfig;
}): Promise<SketchGenerationResult> {
  const { apiKey, baseUrl, createPath, statusPathTemplate, initialPollAttempts, initialPollIntervalMs } =
    getKieRuntimeConfig();

  if (!apiKey) {
    throw new Error("Missing KIE_API_KEY");
  }

  const isTaskApi = createPath.includes("createTask");
  const createRes = await fetch(`${baseUrl}${createPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(
      isTaskApi
        ? {
            model: "nano-banana-2",
            input: {
              prompt,
              aspect_ratio: "3:4",
              resolution: "2K",
              output_format: "jpg",
              google_search: false,
              image_input: [],
            },
          }
        : {
            model: "nano-banana-2",
            prompt,
            style: "pencil-sketch",
            quality: "high",
            response_format: "url",
            max_outputs: Math.max(1, config.maxSketchPerUser),
          }
    ),
  });

  const createPayload = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    const providerMessage = extractProviderErrorMessage(createPayload);
    console.error("[soulmate-sketch/kie] create failed", {
      status: createRes.status,
      statusText: createRes.statusText,
      payload: createPayload,
    });
    throw new Error(providerMessage || `Kie.ai request failed (${createRes.status})`);
  }

  const immediateUrl = extractImageUrl(createPayload);
  if (immediateUrl) {
    return {
      imageUrl: immediateUrl,
      providerJobId:
        createPayload?.job_id || createPayload?.id || createPayload?.taskId || createPayload?.data?.taskId || null,
      raw: createPayload,
    };
  }

  const jobId = createPayload?.job_id || createPayload?.id || createPayload?.taskId || createPayload?.data?.taskId;
  if (!jobId) {
    throw new Error("Kie.ai response did not include image URL or job id");
  }

  const statusPath = statusPathTemplate.replace("{job_id}", jobId);
  for (let attempt = 0; attempt < initialPollAttempts; attempt += 1) {
    await sleep(initialPollIntervalMs);
    const statusRes = await fetch(`${baseUrl}${statusPath}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });
    const statusPayload = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) {
      console.error("[soulmate-sketch/kie] poll non-200", {
        attempt: attempt + 1,
        status: statusRes.status,
        statusText: statusRes.statusText,
        jobId,
        payload: statusPayload,
      });
      continue;
    }

    const taskState = String(statusPayload?.data?.state || statusPayload?.state || "").toLowerCase();
    console.log("[soulmate-sketch/kie] poll", {
      attempt: attempt + 1,
      jobId,
      state: taskState || "unknown",
    });
    if (taskState === "fail" || taskState === "failed") {
      const failMessage = extractProviderErrorMessage(statusPayload) || statusPayload?.data?.failMsg || "Generation failed";
      throw new Error(failMessage);
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

  throw new KieTimeoutError("Timed out waiting for Kie.ai sketch result", String(jobId));
}

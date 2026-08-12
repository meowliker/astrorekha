export type AiSensyCampaignPayload = {
  campaignName: string;
  destination: string;
  userName: string;
  source?: string;
  templateParams?: string[];
  media?: {
    url: string;
    filename: string;
  };
  tags?: string[];
  attributes?: Record<string, string>;
};

export type AiSensySendResult = {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  response?: unknown;
};

const DEFAULT_AISENSY_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

function getAiSensyApiUrl(): string {
  return (process.env.AISENSY_API_URL || DEFAULT_AISENSY_API_URL).trim();
}

function getAiSensyBodyFailure(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== "object") return null;
  const body = responseBody as Record<string, unknown>;
  if (body.success === false || String(body.success || "").toLowerCase() === "false") {
    return String(body.message || body.error || body.reason || "aisensy_rejected");
  }
  if (body.status === false || String(body.status || "").toLowerCase() === "failed") {
    return String(body.message || body.error || body.reason || "aisensy_rejected");
  }
  return null;
}

export function isAiSensyEnabled(): boolean {
  return String(process.env.AISENSY_ENABLED || "").trim().toLowerCase() === "true";
}

export async function sendAiSensyCampaign(payload: AiSensyCampaignPayload): Promise<AiSensySendResult> {
  if (!isAiSensyEnabled()) {
    return { success: false, skipped: true, reason: "aisensy_disabled" };
  }

  const apiKey = process.env.AISENSY_API_KEY?.trim();
  if (!apiKey) {
    return { success: false, skipped: true, reason: "missing_aisensy_api_key" };
  }

  const response = await fetch(getAiSensyApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      campaignName: payload.campaignName,
      destination: payload.destination,
      userName: payload.userName,
      source: payload.source || "astrorekha_app",
      media: payload.media,
      templateParams: payload.templateParams || [],
      tags: payload.tags || [],
      attributes: payload.attributes || {},
    }),
  });

  const responseText = await response.text();
  let responseBody: unknown = responseText;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    // AiSensy may return non-JSON error bodies; preserve the raw body for logs.
  }

  if (!response.ok) {
    return {
      success: false,
      reason: `aisensy_http_${response.status}`,
      response: responseBody,
    };
  }

  const bodyFailureReason = getAiSensyBodyFailure(responseBody);
  if (bodyFailureReason) {
    return {
      success: false,
      reason: bodyFailureReason,
      response: responseBody,
    };
  }

  return { success: true, response: responseBody };
}

import { getSupabaseAdmin } from "@/lib/supabase-admin";

type UsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type ClaudeUsageLogInput = {
  feature: string;
  model: string;
  usage?: UsageLike | null;
  userId?: string | null;
  operation?: string;
  requestId?: string | null;
  status?: "success" | "failed";
  error?: unknown;
  metadata?: Record<string, unknown>;
};

type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-5-20250929": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-haiku-4-5-20251001": { inputPerMillion: 1, outputPerMillion: 5 },
};

const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 3, outputPerMillion: 15 };

function toTokenCount(value: unknown): number {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.round(numberValue);
}

function getErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" ? message : String(error);
}

export function estimateClaudeCostUsd(model: string, usage?: UsageLike | null): number {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  const inputTokens = toTokenCount(usage?.input_tokens);
  const outputTokens = toTokenCount(usage?.output_tokens);
  const cacheCreationInputTokens = toTokenCount(usage?.cache_creation_input_tokens);
  const cacheReadInputTokens = toTokenCount(usage?.cache_read_input_tokens);

  const inputCost = inputTokens * (pricing.inputPerMillion / 1_000_000);
  const outputCost = outputTokens * (pricing.outputPerMillion / 1_000_000);
  const cacheCreationCost = cacheCreationInputTokens * (pricing.inputPerMillion * 1.25 / 1_000_000);
  const cacheReadCost = cacheReadInputTokens * (pricing.inputPerMillion * 0.1 / 1_000_000);

  return Number((inputCost + outputCost + cacheCreationCost + cacheReadCost).toFixed(8));
}

export async function logClaudeUsage(input: ClaudeUsageLogInput): Promise<void> {
  try {
    const inputTokens = toTokenCount(input.usage?.input_tokens);
    const outputTokens = toTokenCount(input.usage?.output_tokens);
    const cacheCreationInputTokens = toTokenCount(input.usage?.cache_creation_input_tokens);
    const cacheReadInputTokens = toTokenCount(input.usage?.cache_read_input_tokens);
    const totalTokens =
      inputTokens +
      outputTokens +
      cacheCreationInputTokens +
      cacheReadInputTokens;

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("ai_usage_logs").insert({
      provider: "anthropic",
      model: input.model,
      feature: input.feature,
      operation: input.operation || null,
      user_id: input.userId || null,
      request_id: input.requestId || null,
      status: input.status || "success",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheCreationInputTokens,
      cache_read_input_tokens: cacheReadInputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimateClaudeCostUsd(input.model, input.usage),
      metadata: input.metadata || {},
      error_message: getErrorMessage(input.error),
    });

    if (error) {
      console.error("[ai-usage-logger] failed to insert usage log", error);
    }
  } catch (error) {
    console.error("[ai-usage-logger] unexpected logging failure", error);
  }
}


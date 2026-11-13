import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { audit, checked, db, type Actor } from "./auth";
import { requireOwnerAccess, requireText, SupportError } from "./policy";
import {
  REPLY_TOPICS,
  type RuleSettings,
  type RuleVersion,
} from "./rules-config";
const RECEIPT_SECONDS = 1800;
export async function currentRules(): Promise<RuleVersion> {
  const row = checked(
    await db()
      .from("support_rule_versions")
      .select("version,content,settings,change_note,published_at,published_by")
      .order("version", { ascending: false })
      .limit(1)
      .single(),
  );
  if (!row)
    throw new SupportError(
      "Support rules are unavailable. Stop this run and contact the owner.",
      503,
    );
  return row as RuleVersion;
}
function signature(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new SupportError("Support rules verification is unavailable", 503);
  return createHmac("sha256", secret)
    .update(`astrorekha:support-rules:v1:${payload}`)
    .digest("base64url");
}
export function issueRulesReceipt(
  tokenHash: string,
  version: number,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({
      tokenHash,
      version,
      expires: Math.floor(now / 1000) + RECEIPT_SECONDS,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function validRulesReceipt(
  receipt: string | null,
  tokenHash: string,
  version: number,
  now = Date.now(),
): boolean {
  if (!receipt || receipt.length > 2048) return false;
  const parts = receipt.split(".");
  if (parts.length !== 2) return false;
  const expected = Buffer.from(signature(parts[0])),
    received = Buffer.from(parts[1]);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return false;
  try {
    const p = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    return (
      p.tokenHash === tokenHash &&
      p.version === version &&
      Number.isSafeInteger(p.expires) &&
      p.expires > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}
export async function requireCurrentRules(request: NextRequest, actor: Actor) {
  const rules = await currentRules();
  if (
    !validRulesReceipt(
      request.headers.get("x-support-rules-receipt"),
      actor.tokenHash,
      rules.version,
    )
  )
    throw new SupportError(
      `Reload the current Support Rules (version ${rules.version}) before continuing. Use the updated Support Kit and run: node scripts/support/client.mjs start. Read the returned rules, then reconsider the next action.`,
      409,
    );
}
export function validateRuleSettings(value: unknown): RuleSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SupportError("Reply and label settings are required");
  const v = value as Record<string, unknown>;
  const label = (key: string) => {
    const name = requireText(v[key], key, 100);
    if (
      /[\r\n]/.test(name) ||
      ["UNREAD", "INBOX", "SENT", "DRAFT", "TRASH", "SPAM"].includes(
        name.toUpperCase(),
      )
    )
      throw new SupportError("Use a custom Gmail label name");
    return name;
  };
  const specificLabel = label("specificLabel"),
    loginLabel = label("loginLabel"),
    completedLabel = label("completedLabel");
  if (new Set([specificLabel, loginLabel, completedLabel]).size !== 3)
    throw new SupportError("The three labels must have different names");
  if (
    !Array.isArray(v.blockedTopics) ||
    v.blockedTopics.some(
      (x) => typeof x !== "string" || !Object.hasOwn(REPLY_TOPICS, x),
    )
  )
    throw new SupportError("Invalid reply topic settings");
  return {
    specificLabel,
    loginLabel,
    completedLabel,
    closing: requireText(v.closing, "required closing", 600),
    signature: requireText(v.signature, "signature", 300),
    blockedTopics: [
      ...new Set(v.blockedTopics),
    ] as RuleSettings["blockedTopics"],
  };
}
export async function publishRules(
  actor: Actor,
  body: Record<string, unknown>,
) {
  requireOwnerAccess(actor);
  const baseVersion = Number(body.baseVersion);
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 1)
    throw new SupportError("Reload the current rules before publishing");
  const content = requireText(body.content, "support instructions", 20000);
  if (content.length < 100)
    throw new SupportError(
      "Include the full support instructions, not just a change note",
    );
  const settings = validateRuleSettings(body.settings);
  const result = await db().rpc("support_publish_rules", {
    p_actor: actor.id,
    p_base_version: baseVersion,
    p_content: content,
    p_settings: settings,
    p_change_note: requireText(body.changeNote, "change note", 300),
  });
  if (result.error?.code === "40001")
    throw new SupportError(
      "Another owner published newer rules. Your edits are still here. Review the latest version before publishing again.",
      409,
    );
  checked(result);
  return result.data as RuleVersion;
}
export async function readRules(actor: Actor) {
  const rules = await currentRules();
  await audit(actor.id, "support_rules_read", String(rules.version));
  return {
    ...rules,
    ...(actor.kind === "api"
      ? {
          receipt: issueRulesReceipt(actor.tokenHash, rules.version),
          receiptExpiresInSeconds: RECEIPT_SECONDS,
        }
      : {}),
  };
}

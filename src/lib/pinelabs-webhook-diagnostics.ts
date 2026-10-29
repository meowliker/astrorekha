import { createHmac, timingSafeEqual } from "crypto";

// Diagnosis only. Results must never be used to authorize a notification.
// Only static labels are returned; no payload, key, or signature is logged.
export function diagnosePineLabsWebhook(raw: string, headers: Headers): string[] {
  const secret = process.env.PINELABS_CLIENT_SECRET?.trim();
  const id = headers.get("webhook-id"), timestamp = headers.get("webhook-timestamp");
  if (!secret || !id || !timestamp || raw.length > 1000000) return [];
  const signatures = (headers.get("webhook-signature") || "").split(/\s+/)
    .filter(part => /^v1,[A-Za-z0-9+/]{43}=$/.test(part))
    .map(part => Buffer.from(part.slice(3), "base64"));
  if (!signatures.length) return [];
  const keys: [string, Buffer][] = [["utf8", Buffer.from(secret, "utf8")]];
  if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(secret)) {
    keys.push(["base64-decoded", Buffer.from(secret, "base64")]);
  }
  if (/^(?:[a-fA-F0-9]{2})+$/.test(secret)) keys.push(["hex-decoded", Buffer.from(secret, "hex")]);
  keys.push(["base64-text", Buffer.from(Buffer.from(secret).toString("base64"), "utf8")]);
  const bodies: [string, string][] = [["raw", raw]];
  if (raw.trim() !== raw) bodies.push(["trimmed", raw.trim()]);
  try {
    const compact = JSON.stringify(JSON.parse(raw));
    if (compact !== raw) bodies.push(["compact-json", compact]);
  } catch { /* An invalid JSON payload cannot add a formatting candidate. */ }
  bodies.push(["json-string", JSON.stringify(raw)]);
  const matches: string[] = [];
  for (const [keyName, key] of keys) for (const [bodyName, body] of bodies) {
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`, "utf8").digest();
    if (signatures.some(signature => timingSafeEqual(signature, expected))) matches.push(`${keyName}/${bodyName}`);
  }
  return matches;
}

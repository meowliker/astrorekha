/** Dedicated US provider credentials are supplied by the isolated caller.
 * Failures stay on US invoice/delivery records, never the main incident table. */
export async function submitBrevoEmail(body: unknown, headers: HeadersInit): Promise<string> {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.messageId) throw new Error("US email submission was not acknowledged");
  return payload.messageId;
}

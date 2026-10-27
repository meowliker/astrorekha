/** US Soulmate-only validation: never send arbitrary browser text as a GA identifier. */
export type SoulmateGaIdentity = { gaClientId: string | null; gaSessionId: string | null };
export function soulmateGaIdentity(value: unknown): SoulmateGaIdentity {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    gaClientId: typeof input.gaClientId === "string" && /^\d{1,20}\.\d{1,20}$/.test(input.gaClientId) ? input.gaClientId : null,
    gaSessionId: typeof input.gaSessionId === "string" && /^\d{1,20}$/.test(input.gaSessionId) ? input.gaSessionId : null,
  };
}

/** Keep the client/session pair from the same source; do not mix different browsers. */
export function chooseSoulmateGaIdentity(primary: unknown, fallback: unknown): SoulmateGaIdentity {
  const first = soulmateGaIdentity(primary), second = soulmateGaIdentity(fallback);
  if (!first.gaClientId) return second;
  return { gaClientId: first.gaClientId, gaSessionId: first.gaSessionId || (first.gaClientId === second.gaClientId ? second.gaSessionId : null) };
}

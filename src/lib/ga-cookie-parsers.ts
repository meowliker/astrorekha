/** The GA client ID is the final two numeric components of the _ga cookie. */
export function parseGaClientId(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/(?:^|\.)(\d+)\.(\d+)$/);
  return match ? `${match[1]}.${match[2]}` : null;
}

/** GA4 has used both GS1.1.<id> and GS2.1.s<id>$... session cookies. */
export function parseGaSessionId(value: string | null | undefined): string | null {
  if (!value) return null;
  const decoded = (() => {
    try { return decodeURIComponent(value); } catch { return value; }
  })();
  return decoded.match(/^GS1\.\d+\.(\d+)(?:\.|$)/)?.[1]
    || decoded.match(/^GS2\.\d+\.s(\d+)(?:\$|$)/)?.[1]
    || null;
}

export function gaSessionCookieName(measurementId: string | null | undefined): string | null {
  const id = measurementId?.trim().replace(/^G-/i, "");
  return id && /^[A-Za-z0-9]+$/.test(id) ? `_ga_${id}` : null;
}

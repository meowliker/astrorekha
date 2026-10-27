"use client";
import { gaSessionCookieName, parseGaClientId, parseGaSessionId } from "./ga-cookie-parsers";
import { chooseSoulmateGaIdentity, soulmateGaIdentity, type SoulmateGaIdentity } from "./soulmate-ga-identity";

/** Ask the supported Google SDK API first. Tracking must never prevent payment. */
export async function readSoulmateGaIdentity(timeoutMs = 1000): Promise<SoulmateGaIdentity> {
  const empty = { gaClientId: null, gaSessionId: null };
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production" ||
      !["astrorekha.com", "www.astrorekha.com"].includes(window.location.hostname)) return empty;
  const measurementId = process.env.NEXT_PUBLIC_GA_ID;
  function cookies(): SoulmateGaIdentity {
    try {
      const read = (name: string | null) => name ? document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) : null;
      return soulmateGaIdentity({ gaClientId: parseGaClientId(read("_ga")), gaSessionId: parseGaSessionId(read(gaSessionCookieName(measurementId))) });
    } catch { return empty; }
  }
  if (!measurementId || !window.gtag) return cookies();
  const get = window.gtag as unknown as (command: "get", id: string, field: string, callback: (value: unknown) => void) => void;
  const identity = await new Promise<SoulmateGaIdentity>(resolve => {
    const values: Record<string, unknown> = {};
    let completed = 0, settled = false;
    const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(soulmateGaIdentity(values)); };
    const timer = setTimeout(finish, timeoutMs);
    for (const [field, key] of [["client_id", "gaClientId"], ["session_id", "gaSessionId"]]) {
      try { get("get", measurementId, field, value => {
        if (settled) return;
        values[key] = typeof value === "number" ? String(value) : value;
        if (++completed === 2) finish();
      }); } catch { if (++completed === 2) finish(); }
    }
  });
  return chooseSoulmateGaIdentity(identity, cookies());
}

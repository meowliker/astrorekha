"use client";
import type { PurchasedBundle } from "@/lib/user-store";
import type { StoredProfile } from "@/lib/stored-profile-types";
import { saveLoginUserId, writeSessionHint } from "@/lib/session-storage";

export type CustomerSession = StoredProfile & {
  id: string;
  coins?: number;
  unlocked_features?: Record<string, boolean>;
  bundle_purchased?: PurchasedBundle;
  palm_reading?: boolean; birth_chart?: boolean; compatibility_test?: boolean; prediction_2026?: boolean;
  soulmate_sketch?: boolean; future_partner_report?: boolean; vastu_shastra_guide?: boolean; aura_color_report?: boolean;
  past_life_report?: boolean; numerology_report?: boolean; spirit_animal_report?: boolean;
  birth_chart_timer_active?: boolean; birth_chart_timer_started_at?: string | null;
  onboarding_flow?: string | null;
  purchase_type?: string | null;
};
let inFlight: Promise<CustomerSession | null> | null = null;
let cached: CustomerSession | null = null;
let checkedAt = 0;
let revision = 0;

export function clearCustomerSessionCache() {
  revision += 1;
  cached = null;
  checkedAt = 0;
  inFlight = null;
}

/** A browser hint is never an authentication fallback. Only the signed cookie resolves identity. */
export async function resolveStoredUserSession(force = false): Promise<CustomerSession | null> {
  if (typeof window === "undefined") return null;
  if (inFlight) return inFlight;
  if (!force && cached && Date.now() - checkedAt < 15000) return cached;
  const currentRevision = revision;
  const load = (async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "include", signal: AbortSignal.timeout(15000) });
    if (currentRevision !== revision) return null;
    if (response.status === 401) { cached = null; checkedAt = 0; return null; }
    if (!response.ok) throw new Error("We couldn’t load your account. Please retry; your purchases have not changed.");
    const { user } = await response.json();
    if (currentRevision !== revision) return null;
    if (!user || typeof user.id !== "string" || !user.id) throw new Error("Unable to restore your account. Please retry.");
    saveLoginUserId(user.id);
    writeSessionHint("astrorekha_email", user.email || "");
    writeSessionHint("astrorekha_checkout_email", user.email || "");
    writeSessionHint("astrorekha_purchase_type", user.purchase_type || "");
    writeSessionHint("astrorekha_onboarding_flow", user.onboarding_flow || (user.purchase_type === "one-time" ? "flow-b" : "flow-a"));
    cached = user;
    checkedAt = Date.now();
    return user as CustomerSession;
  })();
  inFlight = load;
  try { return await load; } finally { if (inFlight === load) inFlight = null; }
}

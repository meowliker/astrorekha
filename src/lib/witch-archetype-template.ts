import { type WitchKey, type WitchProfile, WITCH_TRAITS } from "./witch-archetype";
import type { WitchArchetypeDetails } from "./witch-archetype-details";

export const WITCH_TEMPLATE_VERSION = "witch-archetype-template-v2";

export interface WitchArchetypeTemplate {
  profile: WitchProfile;
  details: WitchArchetypeDetails;
}

export function isWitchTemplate(value: unknown, key: WitchKey): value is WitchArchetypeTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as Partial<WitchArchetypeTemplate>;
  const profile = template.profile;
  const details = template.details;
  return profile?.key === key
    && typeof profile.name === "string"
    && typeof profile.summary === "string"
    && !!details
    && typeof details.whyThisArchetype === "string"
    && typeof details.craftSignature?.intention === "string"
    && typeof details.ritual?.title === "string"
    && Array.isArray(details.ritual.steps) && details.ritual.steps.length === 3
    && typeof details.shadowQuestion === "string"
    && WITCH_TRAITS.every((trait) => Number.isInteger(details.qualities?.[trait]) && (details.qualities?.[trait] ?? -1) >= 0 && (details.qualities?.[trait] ?? 101) <= 100);
}

import { WITCH_PROFILES, type WitchKey } from "./witch-archetype";
import { WITCH_ARCHETYPE_DETAILS } from "./witch-archetype-details";
import type { WitchArchetypeTemplate } from "./witch-archetype-template";
export function localWitchTemplate(key: WitchKey): WitchArchetypeTemplate {
  return { profile: WITCH_PROFILES[key], details: WITCH_ARCHETYPE_DETAILS[key] };
}

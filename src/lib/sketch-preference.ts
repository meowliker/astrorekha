export const PARTNER_PREFERENCES = {
  male: "A man",
  female: "A woman",
  any: "No preference",
} as const;

export type PartnerPreference = keyof typeof PARTNER_PREFERENCES;

export function partnerPreference(value: unknown): PartnerPreference | null {
  return typeof value === "string" && Object.hasOwn(PARTNER_PREFERENCES, value)
    ? value as PartnerPreference
    : null;
}

export function confirmedPartnerPreference(answers: Record<string, unknown>, confirmation: unknown): boolean {
  const preference = partnerPreference(answers.attracted_to);
  return preference !== null && confirmation === preference;
}

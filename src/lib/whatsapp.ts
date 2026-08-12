export function normalizeIndianWhatsappNumber(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091")) return `+91${digits.slice(3)}`;
  return "";
}

export function stripWhatsappCountryCode(value: unknown): string {
  const normalized = normalizeIndianWhatsappNumber(value);
  if (!normalized) return "";
  return normalized.replace(/^\+91/, "");
}

export function toPayUPhoneNumber(value: unknown): string {
  return normalizeIndianWhatsappNumber(value).replace(/\D/g, "");
}

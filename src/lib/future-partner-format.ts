export function toPartnerDisplayName(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "Aarav";

  const normalized = raw.replace(/\s+/g, " ").trim();
  const firstName = normalized.split(" ")[0]?.replace(/[^A-Za-z]/g, "") || "";
  return firstName || "Aarav";
}

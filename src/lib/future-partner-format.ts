export function toPartnerInitial(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "A.";

  const normalized = raw.replace(/\s+/g, " ").trim();
  const firstToken = normalized.split(" ")[0] || "";
  const match = firstToken.match(/[A-Za-z]/);
  const firstLetter = match?.[0]?.toUpperCase();

  return firstLetter ? `${firstLetter}.` : "A.";
}

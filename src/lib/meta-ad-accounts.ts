export function normalizeMetaAdAccountId(value: string | null | undefined): string {
  return String(value || "").replace(/^act_/i, "").trim();
}

export function getMetaAdAccountIdsFromEnv(): string[] {
  const combined = process.env.META_AD_ACCOUNT_IDS || process.env.META_AD_ACCOUNT_ID || "";
  if (!combined.trim()) return [];

  const parsed = combined
    .split(",")
    .map((part) => normalizeMetaAdAccountId(part))
    .filter(Boolean);

  return Array.from(new Set(parsed));
}

export interface MetaAccountCredential {
  accountId: string;
  accessToken: string;
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseTokenMapping(raw: string): Map<string, string> {
  const mapping = new Map<string, string>();
  const trimmed = raw.trim();
  if (!trimmed) return mapping;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      Object.entries(parsed).forEach(([key, value]) => {
        const accountId = normalizeMetaAdAccountId(key);
        const token = stripWrappingQuotes(String(value || ""));
        if (accountId && token) {
          mapping.set(accountId, token);
        }
      });
      return mapping;
    } catch {
      // fall through to line-based parsing
    }
  }

  trimmed
    .split(/\n|,/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const delimiterIndex = line.includes("=") ? line.indexOf("=") : line.indexOf(":");
      if (delimiterIndex <= 0) return;
      const key = line.slice(0, delimiterIndex).trim();
      const value = line.slice(delimiterIndex + 1).trim();
      const accountId = normalizeMetaAdAccountId(key);
      const token = stripWrappingQuotes(value);
      if (accountId && token) {
        mapping.set(accountId, token);
      }
    });

  return mapping;
}

export function getMetaAccountCredentialsFromEnv(): MetaAccountCredential[] {
  const accountIdsFromEnv = getMetaAdAccountIdsFromEnv();
  const sharedToken = stripWrappingQuotes(process.env.META_ACCESS_TOKEN || "");
  const mappingRaw =
    process.env.META_ACCESS_TOKENS_BY_ACCOUNT ||
    process.env.META_ACCESS_TOKEN_BY_ACCOUNT ||
    "";
  const tokenMapping = parseTokenMapping(mappingRaw);

  const accountIds = accountIdsFromEnv.length > 0 ? accountIdsFromEnv : Array.from(tokenMapping.keys());
  if (accountIds.length === 0) return [];

  const creds: MetaAccountCredential[] = [];
  accountIds.forEach((accountId) => {
    const token = tokenMapping.get(accountId) || sharedToken;
    if (!token) return;
    creds.push({ accountId, accessToken: token });
  });

  return creds;
}

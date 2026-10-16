import {
  getMetaAccountCredentialsFromSettings,
  type MetaAccountCredential,
  type MetaAdAccountCredentialRange,
  type MetaAdAccountsSettings,
} from "./meta-ad-accounts";

export function selectMonitoredMetaAccounts(
  settings: MetaAdAccountsSettings,
  envCredentials: MetaAccountCredential[],
  range: MetaAdAccountCredentialRange,
) {
  const inactive = new Map(settings.accounts.filter((account) => account.active === false)
    .map((account) => [account.accountId, account.label || `Ad account ${account.accountId}`]));
  const configured = getMetaAccountCredentialsFromSettings(settings, range)
    .filter((account) => account.active !== false);
  return {
    credentials: configured.length ? configured : envCredentials.filter((account) => !inactive.has(account.accountId)),
    inactive,
  };
}

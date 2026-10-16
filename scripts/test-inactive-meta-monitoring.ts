import assert from "node:assert/strict";
import { selectMonitoredMetaAccounts } from "../src/lib/monitoring-meta-accounts";

const range = { startMillis: Date.parse("2026-10-16T08:00:00Z"), endMillis: Date.parse("2026-10-16T09:00:00Z") };
const settings = { accounts: [
  { accountId: "active-account", accessToken: "active-token", label: "Active", active: true },
  { accountId: "retired-account", accessToken: "retired-token", label: "Retired", active: false },
] };
const env = [{ accountId: "retired-account", accessToken: "env-token" }];

const selected = selectMonitoredMetaAccounts(settings, env, range);
assert.deepEqual(selected.credentials.map((account) => account.accountId), ["active-account"]);
assert.equal(selected.inactive.get("retired-account"), "Retired");

const onlyInactive = selectMonitoredMetaAccounts({ accounts: [settings.accounts[1]] }, env, range);
assert.deepEqual(onlyInactive.credentials, [], "environment fallback must not re-enable an explicitly inactive account");

console.log("Inactive Meta account monitoring tests passed");

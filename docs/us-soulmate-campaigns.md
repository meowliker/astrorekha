# US Soulmate campaign selection

Ported from `d89d4d4` (original Soulmate campaign reporting).

Open **US Soulmate Tracking → Campaigns** or **US Soulmate Profit Sheet → Accounts & Campaigns**. Both edit the same US settings. Add a USD ad account and its Meta token, select the US campaigns, and save. Shared accounts are supported; credentials and selections stay in `us_soulmate_admin_settings`, with no fallback to other workspaces.

Selected campaigns alone contribute Meta spend and results. US revenue still includes all verified live production US orders, including unmatched orders. Campaign and ad-set budget/bid access is checked against the selection. Account balances are omitted because they cannot be allocated to campaigns.

Saving increments the settings revision. Old account-wide figures and figures for previous selections are hidden until recalculated. Refresh recalculates the latest two reporting days; Backfill recalculates earlier dates. USD, Stripe refund reconciliation, and saved order tax amounts remain unchanged.

No new migration or environment variable is needed: campaign IDs are saved inside the existing accounts JSONB field by the existing US settings RPC. No campaigns are selected automatically.

Offline regression coverage: `node --test scripts/test-us-soulmate*.cjs`.

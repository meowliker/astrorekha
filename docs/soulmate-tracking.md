# Soulmate Tracking

Open `/admin/soulmate/tracking` from the **Soulmate Tracking** card in the admin workspace.

The screen mirrors the normal tracker: date presets, US/Indian/both reporting windows, account selection, search, active filters at campaign/ad-set/ad level, sorting, column selection and ordering, presets, shared saved views, live sales, campaign/ad-set/ad drilldowns, hourly sales/revenue/ROAS/CVR, Meta activity log, budget and bid editors, and bounded pending-payment reconciliation.

## Connect reporting

- Open **Campaigns** in Soulmate Tracking or **Accounts & Campaigns** in Soulmate Profit Sheet. Select one or more campaigns by name/ID for each account and save. Both pages use the same selection in `soulmate_admin_settings`. Set the exchange rate in Soulmate Profit Sheet.
- Tracking opens on today for the selected reporting window. Custom date ranges remain available in the date picker.
- Shared accounts are supported with a required campaign allowlist. Empty selection never means all campaigns. Soulmate uses only its own saved access token; it never falls back to normal-flow credentials or environment accounts.
- Meta purchase metrics are Meta's attributed conversions for the selected campaigns only. Internal Soulmate sales are separate, verified payments joined by campaign/ad-set/ad IDs, with unique campaign-name fallback.
- After changing the campaign selection, use **Backfill** to recalculate earlier dates. Stale account-wide spend/profit is hidden until it is recalculated. Refresh continues to update only the latest two reporting days.
- Shared account balances are excluded because they cannot be allocated to a campaign. Normal-flow reporting remains unchanged and may still include the entire shared account.
- Missing accounts or failed Meta requests do not imply zero advertising cost. Profit is unavailable until spend can be obtained.

Meta URL parameters (same naming convention as the normal tracker):

```text
utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&meta_campaign_id={{campaign.id}}&meta_adset_id={{adset.id}}&meta_ad_id={{ad.id}}
```

Use the Soulmate destination URL, `https://astrorekha.com/soulmate`.

## Isolation and attribution

- Sales: `soulmate_orders`, `funnel=soulmate_standalone`, live payments, production tracking environment, paid status, and actual `paid_at` time. Local/test/preview/failed orders never contribute.
- Visits: only `marketing_events` with `product_type=soulmate_standalone` and `event_name=soulmate_landing_view`. Reloads for the same session and campaign/ad are deduplicated. New events store the validated arrival URL; historical events use their saved Soulmate landing URL where available. Missing historical attribution cannot be reconstructed.
- Browser attribution: `astrorekha_soulmate_attribution`, separate from normal attribution storage. A new tagged arrival replaces previous campaign fields together; an old ad ID cannot override a new campaign name.
- Shared views: dedicated `soulmate_tracking_views`, service-role only with RLS. Browser column/timing/child caches use `ar_soulmate_tracking_*` keys.
- Ad credentials and FX: `soulmate_admin_settings`. Campaign IDs are stored alongside each Soulmate account; normal settings are never read or written.
- Refunds: `soulmate_refund_events`, reconciled by the Soulmate Profit Sheet refresh. New syncs preserve the gateway timestamp; legacy date-only events are explicitly flagged as approximate in hourly tracking.
- Reconciliation calls `reconcileSoulmateOrder` for recent pending production Soulmate orders only. It does not run in local/preview builds and never invokes normal payment fulfillment.
- Budget/bid changes require a currently connected Soulmate account and verify both the target object's owning account and selected parent campaign. No real budget or bid changes are needed for QA.

The normal tracking page, APIs, attribution capture, payment ledger and Meta libraries remain unchanged. Read-only/pure Meta and formatting helpers are reused.

## Verification

`node --test scripts/test-soulmate-campaigns.cjs scripts/test-soulmate-tracking-dashboard.cjs scripts/test-soulmate-tracking.cjs scripts/test-soulmate-profit.cjs`

Also run the existing tracking budget, bid-marker and hourly-ROAS checks, TypeScript, lint and the production build. The dashboard test suite uses only fixtures and blocks external requests.

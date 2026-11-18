# Google Ads reporting (13 November 2026)

## Access and scope
The existing Google service account can read USA 487-011-3996 and India 675-227-5511. The connector uses the existing GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY server-side, OAuth adwords scope, and Google Ads API v26. No new secret or database migration is required. Only fixed search queries are implemented; no ad mutations.

USA reports USD in America/New_York. India reports INR in Asia/Calcutta. Neither account's country determines the product workspace. Historical reported landing URLs allocate spend to AstroRekha, Soulmate, US Soulmate or US AstroRekha. In the verified configuration, USA brand and general Search campaigns point to /discover (INR AstroRekha), while its sketch campaign points to /us/soulmate/discover. No campaign currently points to /us.

## Reporting
Tracking and profit endpoints support Google, Meta and combined views. Actual orders/refunds continue to come from the existing source-filtered payment records. Google provides campaign budgets, costs, clicks and impressions. Other unsupported Google metrics remain unavailable. Existing saved Meta profit rows remain unchanged: Google costs are overlaid read-only so refresh cannot persist or double-count them.

Google account clock hours are converted into the selected reporting window with DST handling. Partial clock hours are never split by assumption. Incomplete/mixed landing destination coverage or failed API access produces an unavailable warning, not fabricated zero spend or profit. Snapshots are cached in process for five minutes. Google reporting itself can lag.

## Campaign tags still needed from the agency
Auto-tagging is enabled on both accounts. No customer, campaign, ad-group or ad-level final URL suffix/tracking template was configured at verification. Existing final URLs also lacked campaign UTMs. Ask the agency to add this Final URL suffix to both accounts while retaining auto-tagging:

    utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}

The suffix has no leading question mark. Do not substitute a tracking template for a final URL suffix. Check for any intervening agency changes before applying. The app matches the saved utm_campaign to the unique Google campaign ID/name. Orders without a saved campaign are retained under Google Ads, campaign not provided; API access alone cannot reconstruct a historical campaign from those records.

## Verification
Live API reads succeeded for both accounts. Local tracking endpoints for all four workspaces returned 200. For 12 November's 11:30 IST reporting day, main AstroRekha costs were USD 51.99851 (converted using the existing FX setting); US Soulmate cost was USD 49.538045. Unit/regression checks cover mapping, currency, date validation, DST, unknown costs, source separation and read-only profit overlays. No payment, fulfillment, ad mutation or analytics event was invoked during verification.

Reporting is available at /admin/tracking?adSource=google and the Revenue Dashboard’s Profit Sheet tab, with corresponding pages in each product workspace.

## Local correction — 18 November 2026

Google profit sheets separate product identity from ad-account reporting ownership. Historical normal AstroRekha purchases acquired by Astro USA appear in the US main Google workspace; the Indian AstroRekha sheet contains only Astro India. Each sheet includes uniquely matched orders and destination-matched spend from its owning account, using that account’s complete calendar day. Indian sheets use IST; USA sheets use New York time. There is no timezone selector or estimated hourly allocation.

Unmatched Google receipts have a separate table in their original product workspace. They are not assigned to either account, included in matched-account profit, or reclassified as Meta. Refunds continue to inherit the original purchase attribution. Reporting reads existing payment records; it does not replay payment callbacks, purchases, unlocks or analytics events.

Saved reports use a new versioned cache key. Last verified rows are retained independently per account when Google's component reports temporarily disagree. Account, funnel, timezone, currency and exchange rate must match before reuse. Cache data remains in the existing reporting table; no schema migration is required.

Local review URLs: `/admin/google/astrorekha/revenue` (Profit Sheet), `/admin/google/soulmate/profit`, and `/admin/google/us-soulmate/profit`.

### Regional Google profit sheets (18 November correction)

Each sheet is scoped to its owning account: India 6752275511, USA 4870113996. The Indian AstroRekha sheet never renders an Astro USA section. US main Google reporting includes historical INR /discover payments acquired by Astro USA, plus native US-main USD orders, each once. Their payment records, product identity, entitlements and emitted tracking events are unchanged. The US table shows original INR receipts alongside USD equivalents at the displayed reporting rate; converted sales/profit are not native USD settlements or Google's conversion value. Spend combines disjoint /discover and /us destination buckets for Astro USA only, in New York calendar days. Snapshot revision 4 prevents old layout/scope cache reuse. Unmatched campaigns stay separate.

## Checkout attribution correction — 18 November 2026

The verified 15 November order `pnlee4998a9911723406135d83d` (INR 1,886.82) belongs to Astro USA Google Brand campaign `24406367754` under the last-ad-click-before-payment rule. It started with Meta, then the same browser/user opened a verified Google click before payment. The metadata-only repair preserves the original first touch and checkout touch, financial/fulfillment fields, existing purchase-event ID and all external event delivery flags. No conversion is resent. It counts once in the US main Google sheet, not in Meta or the India Google sheet. `scripts/repair-nov15-google-attribution.cjs` is dry-run by default and validates the exact click, buyer, payment return, amount and timestamps before `--apply`.

Future main INR checkouts receive a signed, HttpOnly two-hour attribution-only cookie. A new explicit ad-tagged page view can append evidence only for that checkout. Anonymous body user IDs/order IDs cannot select the order. Evidence uses a database observation timestamp and deduplicated touch key; clean navigation and other product routes are ignored. After verified payment and durable access, optional finalization uses only evidence before the provider payment timestamp. If that timestamp is unavailable, the checkout snapshot remains unchanged. This does not alter gateway verification, fulfillment, purchase-event IDs or deduplication.

Apply `20261118160000_checkout_attribution_touches.sql` before releasing the new capture code. Missing schema/capture failures do not block checkout, payments or unlocks. The migration has only an RLS-protected evidence table with service-role select/insert rights. It does not modify payments. The migration was tested against local PostgreSQL (PGlite), then applied transactionally to production on 18 November. Its migration record, RLS, browser-role denial and service-role access were verified through SQL and the REST schema.

GA4's server purchase uses its browser client/session IDs and no longer repeats stale checkout source/campaign fields. Google warns that manual campaign fields can override existing GCLID attribution: https://support.google.com/analytics/answer/11080067 . This prevents the identified implementation conflict; it cannot guarantee Google Ads credit under every consent/model/identity condition or rewrite historical GA4 attribution. The 12 November payment remains a verified Google acquisition in internal reporting, without resending its purchase.

Verification: the metadata-only repair was applied to shared Supabase on 18 November. A read-back confirmed Google=true, Meta=false, the original payment/fulfillment/delivery fields unchanged, and exactly one internal purchase event. The local browser at `/admin/google/us-main/revenue` shows 15 November: one order, INR 1,886.82 original; November totals: five orders, INR 4,855.70 original. The production build, checkout-attribution/GA4 tests, fulfillment/reconciliation and reporting regression checks passed. Release checks on 18 November also passed against the latest main branch; the additive migration is applied. See the release verification record for deployment and production checks.

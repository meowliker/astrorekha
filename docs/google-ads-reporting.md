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

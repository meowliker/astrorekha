# Discover funnels verification — 4 November 2026

## Release Verdict

GO WITH RISKS for local review. The app-side checks passed and the local production build is running on port 3152. Production rollout was authorized after these local checks; deployment verification is reported separately. This does not certify a live Google Ads Purchase conversion or a new production provider job.

## Blocking Issues

No failing app regression was found in the tested paths. Published GTM container GTM-TDGZTVTD is version 6 and has CTA/quiz conversion triggers, but no dedicated Purchase/purchase_complete trigger. The agency must confirm the Google Ads Purchase tag or existing GA4 purchase import before claiming that Ads purchase delivery is verified. No conversion label or purchase event was invented or resent.

The local Meta IDs are blank and the US GA4 ID is absent. Those settings were preserved to avoid sending synthetic transactions into live advertising. Production main and US Pixel/GA4 configurations were inspected read-only. The production main GA4 browser and server measurement IDs match and server debug collection is off. The Vercel connector could not read environment metadata (403); the existing authorized CLI completed the read-only checks. No secret values were printed or modified.

## Flow A Results

The separate Google Ads paywall retains the original markup/design. Both duplicate GST paragraphs were removed; the prices retain incl. GST. Actual server prices and GST calculations are unchanged. Ten isolated paywall browser scenarios passed for PayU, Paytm and Pine Labs success/failure, exact selected plan IDs and charged totals, terms gating, coupon redemption/errors, pending recovery, different-email isolation and scoped failed retry.

The full original and Ads palm journeys previously passed real client-side hand validation and retained UTM/click attribution, quiz events and shared payment confirmation. Fresh checks also verified Facebook, gclid, gbraid and wbraid attribution survives the clean paywall URL. GA cookie parsing and saved PayU product metadata checks passed.

## Flow B Results

Flow B question routing and original paywall/controller logic were not changed. Existing original markup, payment/coupon handlers and shared post-payment screens remain protected by baseline checks. Original India and US offer/checkout/retry checks and both revised regional question-to-checkout-to-confirmation flows passed in the layout-correction pass. This is not a new live Flow B purchase.

## Reports & Unlock Results

220 automated checks passed across route/layout compatibility, payment verification, fulfillment, receipt authorization, GA4/Meta event identity and deduplication, product entitlements, report workers, private artifacts/PDF quality and email recovery/delivery handling.

Three browser scenarios covered all active palm bundles from the new paywall through shared paid confirmation, canonical customer identity, exact server-provided unlocks, palm report generation with the saved birth details, persistence and cached reload without regeneration. Both bundles containing Birth Chart additionally generated and reloaded the cached chart with the correct date, time and geocoded coordinates. Locked extra reports remained locked.

Real palm/sketch handlers were tested with provider/database boundaries isolated. Checks covered incomplete input rejection, locked/unsigned sketch rejection, saved answer merging, generation limits, slow generation handing off the same job to polling, completion and provider-error recovery. Regional automatic workers generated test artifacts for exactly the purchased entitlements and exercised delivery safeguards with simulated providers; no live email or AI generation was submitted.

A pre-existing birth-chart edge case was found and corrected: zero hours was interpreted as missing, turning midnight into noon. Five midnight/noon/late-night timestamps now reach all five provider requests unchanged in a focused regression test.

## API/Console Errors

Production build, full-source ESLint, TypeScript and whitespace checks passed. No uncaught page errors were recorded in the three report browser scenarios or paywall cases. Simulated provider errors and intentionally blocked vendor calls are expected test conditions.

A read-only production inspection found two queued initial PageView events on the main Pixel. The local fix gives the existing route tracker sole ownership of initial/SPA PageViews, retries SDK startup safely and disables the SDK history auto-tracker. Tests cover both initialization orders, ordinary rerenders and route/query navigation. Purchase events are unchanged; browser and server transaction IDs, actual totals and currencies still agree for all three gateways. The live Meta SDK source confirms that it honors disablePushState. This fix is included in the authorized release candidate; its production delivery is checked separately.

## Fix Recommendations

Review the local paywall, then authorize deployment separately when ready. Have the agency confirm the intended Google Ads Purchase action/tag or GA4 import and inspect all three destination journeys in Tag Assistant. A live post-deployment purchase/provider confirmation remains separate from these isolated checks. Do not replay purchases, reset delivery stamps or send synthetic purchases to ad accounts to test it.

Logs: /tmp/discover-complete-verification-*.log. Read-only configuration evidence: /tmp/discover-production-tags.json, /tmp/discover-production-env-metadata.json and /tmp/discover-verified-gtm-summary.json. Browser report evidence: /tmp/astrorekha-report-flow-qa. Prior layout comparisons remain under /tmp/astrorekha-original-design-comparison.

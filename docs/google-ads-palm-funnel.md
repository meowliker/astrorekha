# Main palm-reading funnel for Google Ads

Release candidate prepared on 4 November 2026. Production rollout authorized by the owner; deployment verification is reported separately.

## Route and scope

- Public entry: `/discover`.
- The same existing questions, birth-date/time/place controls, calculated signs, preferences, palm camera/upload and contact form are reused under `/discover/onboarding`.
- The route supplies a presentation context to the existing components. It does not copy their payment, validation or state-management logic. Original routes use the original router and presentation by default.
- Contact submission opens the separate `/discover/onboarding/bundle-pricing` presentation, which calls the original paywall controller and its unchanged purchase/coupon handlers. Server catalog prices, tax calculation, product IDs, gateway choice, verification, upsells, registration, fulfillment and report access are unchanged. The new presentation shows the full GST-inclusive total before payment.
- The original `/`, `/onboarding`, `/soulmate`, `/us/soulmate` and their checkout destinations remain available. No gateway, environment variable, migration or production setting is changed for this feature.

## Changes limited to the new journey

- The entry renders useful HTML, a working link and business/contact details without JavaScript. It does not start with an empty loading screen or redirect returning visitors automatically. Returning customers get an explicit account/resume link.
- Copy identifies AI-generated digital reports, personal reflection and a paid bundle before checkout. The entry and sidebar link to the existing business and policy pages.
- Progress spheres describe journey progress instead of forecast accuracy. Unsupported rare-spark claims, the simulated recent-customer ticker, fixed personal reading scores and the illness-recovery prediction are not presented in this journey.
- Palm upload describes preparing a preview rather than claiming that a finished paid report has already been generated. Existing image validation and processing behavior is retained.
- Welcome, header and scanner assets use existing first-party public files rather than the configured public R2 hostname. The separate paywall also uses first-party assets. Original paywall assets are unchanged.
- Added ordinary public `robots.txt` and `sitemap.xml` discovery. Account, admin and transactional pages are excluded from the sitemap; robots rules are not access controls.
- Every visitor receives the same route content. There is no referrer, IP, location or user-agent switch for crawlers.

## Tracking and shared payment boundary

The existing MarketingBoundary owns GTM, GA4, Meta and Clarity. This change adds no loader, pixel, purchase sender or purchase event. Existing `quiz_start`, `quiz_complete`, checkout events, UTMs and Google click identifiers remain in use. The route-impression tracker also recognizes the new onboarding paths using its existing schema and deduplication.

The original GA4/Meta payment reporting, receipt authorization and purchase deduplication code is byte-identical to the current base. Browser checks use intercepted API/payment responses and never submit a real payment, fulfillment request or purchase delivery.

Agency action after an approved deployment: use the new URL as the ad destination and verify it in GTM Preview. Any agency tag limited to old page paths or a specific old CTA selector must include the new route. GTM installation alone does not configure Google Ads conversion actions, Conversion Linker, Enhanced Conversions or campaign attribution.

## Remaining audit limitations

The new palm paywall removes unsupported ratings, testimonials, recent-customer tickers, random personal scores, fake offer badges and claims that a finished report is already ready. It clearly identifies AI content and shows tax-inclusive prices and business details. The original paywall and original India/US Soulmate routes retain their existing presentation. Scoped route changes do not establish Google approval or clear the domain/account suspension. The agency must review the complete destination and configure/confirm its Google Ads Purchase conversion mapping.

Audit: https://docs.google.com/document/d/19_ROozNYwrsLxabIP4MG6quzWDIpL-1LgOvV2oshdzU/edit

## Failed-payment retry

The existing pending-payment record includes the known Ads checkout path only when initiated there. A short-lived session record binds that presentation to the exact transaction, covering the PayU popup race where pending state is cleared before processing mounts. Missing, stale, corrupt or unrelated records use the original checkout destination. This record contains no email, cannot redirect externally, and never declares payment success or grants reports. Success still goes to the original shared upsell.

## Rollback

This is a code-only feature: remove the `/discover` routes and their sitemap entry, then remove the scoped context/conditionals and tracking-route allowance. No data rollback, entitlement change, gateway switch or analytics resend is required. Until a deployment is authorized, production is unchanged. Existing unpushed Paytm reconciliation work is separate from this feature.

## Verification

- Production build, TypeScript and ESLint error checks passed.
- Eight focused routing, tax-quote, exact handler/legacy-markup preservation and order-bound retry tests passed.
- Ninety-nine existing payment, recovery, tracking and reconciliation regression tests passed.
- Mobile browser fixtures cover both original and new journeys, real client-side hand-model validation using a public sample image, saved attribution, one quiz-start/complete event and their respective paywalls.
- A mocked hosted payment from the new journey reaches the existing payment-processing and upsell screens once, with the original attribution intact. This is a browser integration check, not a new live gateway charge or a claim of delivery in GA4/Ads.
- All sixteen existing hosted Paytm success/failure and PayU recovery/email-identity browser scenarios passed against the same local production build.
- Direct links, browser back, reload and forward navigation retain the new journey. Unknown/nested/payment steps in the new namespace return 404; first-party assets, robots and sitemap return correctly.

Browser evidence and detailed logs: `/tmp/astrorekha-google-ads-qa/`. The local review server uses port 3152.

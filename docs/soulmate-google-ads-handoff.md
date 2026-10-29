# Agency Google Ads tracking handoff — 30 October 2026

Source: [AstroRekha – Soulmate Tracking Setup](https://docs.google.com/document/d/1tRaqu4b1GVZqArKolQsJYgaBmP2PwOaMlcV9PB7UryQ/edit).

## Audit and implementation

- GTM `GTM-TDGZTVTD` is already installed through the shared layout's MarketingBoundary. The live `/soulmate` page loads its script and includes the noscript fallback. Do not install a second container or add `@next/third-parties` as a duplicate loader.
- The publicly served container version 1 has empty tags, predicates and rules as of this audit. This does not prove whether the agency has unpublished workspace changes. Google Ads IDs/labels are blank in the supplied document.
- Existing GA4 `G-FYRME5NT9Q`, Meta Pixel and server-side purchase tracking remain in place. No new GA4 config or GA4 purchase event is added by this patch.
- The agency's exact custom events were missing. This change adds them to both funnels; the release result is recorded separately after deployment.
- Both `/soulmate` and `/us/soulmate` collect email on their checkout forms, not in the chat. Both now supply the requested events. The Indian funnel charges INR; the US Stripe funnel charges USD.

## Website event contract

Both funnels use these event names. The table describes the Indian payload; the US payload uses `funnel: us_soulmate_standalone`, `currency: USD`, saved `us_sm_…` order IDs, and actual charged cents converted to dollars. Discounts, tax and add-ons are reflected in the saved total, rather than a hardcoded plan price. CTA locations are identical.


| Event | Trigger | Fields |
| --- | --- | --- |
| `cta_click` | Hero or bottom “Begin My Chat Reading” button | `cta_location`: `hero` or `bottom`; `funnel`: `soulmate_standalone` |
| `email_submitted` | Valid email submitted using Pay Now on the current checkout form | Normalized `user_email`; `funnel`: `soulmate_standalone` |
| `purchase_complete` | Receipt-authorized status API confirms a paid, live production order | `transaction_id`: saved `sm_…` order ID; numeric `value`: actual total paid including GST/add-ons, converted from paise to rupees; `currency`: `INR`; normalized `user_email`; `funnel`: `soulmate_standalone` |

Purchase deduplication uses memory plus sessionStorage keyed by order ID. Google Ads must also receive that ID for its own deduplication across sessions/devices. A page reload in the same session does not push again. Browser storage blocking still has in-memory protection; cross-document deduplication then depends on Google Ads' transaction ID handling.

Contact data is only returned by the paid-order status endpoint after its existing private receipt-cookie check, with `Cache-Control: no-store`. It is not placed in URLs or analytics storage. GTM's `user_email` data-model value is cleared after each event. Configure the user-provided-data variable on these events, not a later page event. Do not map raw email to GA4 event parameters, URLs, custom dimensions or general analytics logs.

PayU, Paytm and Pine Labs callback paths already return Soulmate orders to `/soulmate/payment?order=…`. US Stripe returns to `/us/soulmate/payment?order=…`. This patch does not change gateways, payment verification, fulfillment, or existing server purchase reporting. A customer who closes the gateway before returning cannot trigger a browser GTM conversion; existing server GA4/Meta reporting remains separate. These browser events do not implement Google Ads server-side/offline conversions.

## Agency work still required

1. Use the existing GTM container; obtain access from the owner if needed. No permissions were changed during this audit.
2. Create the three Google Ads conversion actions and provide their real conversion ID/labels. Set Purchase to Primary and CTA/Lead to Secondary as agreed with the business.
3. Configure the three exact custom-event triggers, data-layer variables, Google Ads tags and Conversion Linker. Scope triggers by the `funnel` variable: `soulmate_standalone` for India and `us_soulmate_standalone` for US. If separate conversion actions are wanted, give each funnel its own matching tags. Always read currency and value dynamically; never hardcode INR or USD across both funnels.
4. Configure Enhanced Conversions using `user_email` as Google Ads user-provided data, with the applicable account settings, consent controls and customer-data terms. The website events alone do not enable Enhanced Conversions. Follow the current Google Ads UI if labels differ from the document.
5. Preserve the direct GA4 implementation. Do not add another GA4 config/purchase tag; avoid making both a GA4-imported purchase and this Ads purchase primary for the same sales.
6. After code deployment, use GTM Preview to check both CTAs, a valid checkout submission, a confirmed purchase, the real INR/USD total and transaction ID in each funnel, and refresh deduplication. Then publish the container and inspect Google Ads diagnostics. No conversion delivery or campaign attribution is claimed until this is done.

## Validation

Isolated tests cover event payloads, amount conversion, invalid inputs, environment isolation, blocked storage, reload/remount protection, paid versus pending/failed status, receipt-cookie authorization, and existing GA4/Meta reporting. No live purchase, refund or advertising conversion was created for these tests.

References: [Google data layer](https://developers.google.com/tag-platform/tag-manager/datalayer), [Google Ads Enhanced Conversions with GTM](https://support.google.com/google-ads/answer/13262500).

## Release QA scope

### Release Verdict
GO for the scoped Soulmate tracking change after build, lint, TypeScript and 241 offline regression tests passed. Live deployment verification is recorded separately. Google Ads conversion activation still requires agency configuration and a real end-to-end conversion test.

### Blocking Issues
No code regression found in the affected paths. Google Ads conversion IDs and labels were not supplied; its published container has no tags. This blocks claiming Ads conversions are active, not publishing the website event support.

### Flow A Results
The legacy onboarding Flow A is outside this change. No files in that flow changed. Its full paid browser journey was not rerun; no claim of a complete Flow A certification is made.

### Flow B Results
The legacy onboarding Flow B is outside this change. No files in that flow changed. Its full paid browser journey was not rerun; no claim of a complete Flow B certification is made.

### Reports & Unlock Results
117 offline fulfillment, report preparation/worker and PayU recovery regression tests passed. No live report was generated or access changed. 124 tracking/payment tests passed, including receipt authorization, failed/pending isolation, discounted USD totals, reload deduplication, and existing GA4/Meta contracts.

### API/Console Errors
Local production-build India and US landing pages opened their chat sessions with no captured console errors. Build, lint and standalone TypeScript checks passed. Browser purchase receipts were tested using mocked API responses, not a new live charge.

### Fix Recommendations
Agency must configure/publish Google Ads tags, Conversion Linker and Enhanced Conversions mapping, then run GTM Preview and a genuine paid conversion on each funnel. Preserve direct GA4 and existing Meta ownership.

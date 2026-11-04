# Discover funnels implementation and tracking

Implementation reviewed on 4 November 2026. Production rollout authorized by the owner after local verification; deployment verification is reported separately.

## Routes

| Experience | Entry | Checkout |
| --- | --- | --- |
| Palm reading | `/discover` | `/discover/onboarding/bundle-pricing` |
| India AI Soulmate Sketch | `/soulmate/discover` | `/soulmate/discover/checkout?plan=standard` or `express` |
| US AI Soulmate Sketch | `/us/soulmate/discover` | `/us/soulmate/discover/checkout?plan=standard` or `express` |

Old local `/google-ads` entry/onboarding links redirect permanently to `/discover`, preserving query parameters. Original main, India Soulmate and US Soulmate routes remain available with their original presentation. The new routes show the same content to all visitors; there is no bot, referrer or IP-based selection.

## Shared behavior and audit changes

The Soulmate landing and offer markup is copied from each original regional page and uses its original CSS, section order, horizontal galleries, cards, FAQ controls and final CTAs. Unsupported outcome/social-proof content is rewritten in place rather than using a simplified replacement layout. The original illustrated checkbox add-on cards are also retained, with the original regional artwork optimized as first-party WebP assets.

The Soulmate copies reuse the existing seven questions, answer validation, draft saving, plan IDs, catalog, order creation and payment handlers. Their new presentation identifies the automated AI guide, removes fabricated availability/scarcity, resetting offer deadlines, outcome testimonials and unsupported social proof. It shows a zodiac sign without a decorative compatibility score. Example portraits are labeled as illustrative AI artwork. The public business name, actual address, phone, email and policy links are visible on the landing, offer and checkout.

India and US artwork remains separate and is served from optimized first-party assets. New offers and optional extras show tax-inclusive amounts derived from the existing cart functions. Amounts, tax rates, available add-on IDs and report generation are not changed. New display names do not alter purchased product IDs or order contents.

India uses the currently selected payment gateway. US checkout retains Stripe card fields, existing price configuration, promotion-code handling and confirmation. Both reuse the receipt-authorized status APIs and original confirmation/fulfillment. A small session record binds a new discovery checkout to its exact order so failed-payment retries return to the matching discovery offer. It cannot choose a gateway, declare payment success, change access or redirect outside approved paths. Original orders keep their existing retry destination.

The palm journey has a separate paywall presentation copied from the original markup, preserving its section order, classes, card layouts, artwork containers, preview charts, advisor, footer and sticky CTAs. It uses the original checkout controller and unchanged purchase/coupon handlers. Unsupported testimonial/rating/counter claims are rewritten inside the original containers, personalized random scores are replaced with explicitly labelled fixed example charts, and offer badges use factual labels; all bundle cards and checkout buttons show the total including 18% GST. Available bundles and default selection are unchanged. Its failed-payment retry is bound to the exact order through pending/session state, including the PayU popup race, while success still joins the original upsell. Original main/Soulmate/paywall presentation is preserved. These routes address scoped audit findings and do not establish Google policy approval or clear a domain/account suspension.

## Tracking ownership

The existing root MarketingBoundary still owns GTM `GTM-TDGZTVTD`, the appropriate GA4/Meta configuration and Clarity. No duplicate container, GA4 purchase sender, conversion ID or conversion label was introduced. Existing US/non-US isolation remains intact.

| Journey | Website events available to GTM |
| --- | --- |
| Palm | Existing `quiz_start`, `quiz_complete`, `begin_checkout`; server-confirmed GA4 purchase delivery remains under its original owner |
| India Soulmate | `cta_click`, `email_submitted`, `purchase_complete`; `funnel: soulmate_standalone`; INR |
| US Soulmate | `cta_click`, `email_submitted`, `purchase_complete`; `funnel: us_soulmate_standalone`; USD |

Soulmate CTA locations remain `hero` and `bottom`, and the CTA text/IDs remain compatible with existing click triggers. Custom purchase events use the saved order ID and the actual paid amount, including selected extras, tax and any saved US discount. They fire only when the receipt-authorized API confirms a paid production order, and keep the existing reload deduplication. Pending/failed orders do not create purchase events. Existing Meta event IDs remain unchanged.

UTMs and Google click IDs remain attached through new entry, chat, checkout and payment. The recorded marketing landing path identifies the new route. Google braid-only arrivals now reset stale campaign identifiers in both regional attribution helpers, matching their existing behavior for gclid-tagged arrivals. The main palm helper is unchanged.

Raw email in `email_submitted` and `purchase_complete` is reserved for Google Ads user-provided-data mapping, is cleared from the GTM data model afterward, and must not be forwarded to GA4 event parameters or URLs. No additional contact data is persisted in analytics storage by this change.

## Google Tag Manager agency action

The publicly served container was version 6 when inspected. It has Google Ads base and CTA/quiz conversion tags, targeting two Ads destinations. The inspected trigger rules do not contain a dedicated `purchase_complete` conversion trigger. Do not describe purchase conversion delivery to Google Ads as verified merely because website events exist.

The agency must confirm which Ads destinations/conversion actions are intended, then configure or verify the real Purchase conversion label. For a browser Ads tag, use `purchase_complete`, scope it by `funnel`, and map `transaction_id`, `value` and `currency` dynamically. Alternatively, use the existing GA4 purchase import as the primary purchase conversion; avoid counting both methods as separate primary purchases. Preserve the direct GA4 implementation.

Use one CTA conversion trigger per action, either the existing click trigger or the custom `cta_click` event; do not count both. Map `email_submitted` only to the intended lead action. Verify Enhanced Conversions and applicable consent/account settings. No Google Ads label was invented and no GTM container or account setting was published during this work.

After authorized deployment, use GTM Preview on all three URLs and verify one real intended conversion with the correct currency, total and order ID. Local browser fixtures prove website behavior only, not Google Ads attribution or receipt of an actual conversion.

## Rollback

This feature needs no migration or environment change. Revert its route/context/presentation/asset changes and the old-route aliases, leaving the shared payment APIs, gateway configuration, purchase senders and fulfillment in place. If only ad destinations must be rolled back, use the original public routes. Separate unpushed Paytm reconciliation work is outside this feature.

References: agency audit https://docs.google.com/document/d/19_ROozNYwrsLxabIP4MG6quzWDIpL-1LgOvV2oshdzU/edit ; Google policy https://support.google.com/adspolicy/answer/6020955 ; Google data layer https://developers.google.com/tag-platform/tag-manager/datalayer .

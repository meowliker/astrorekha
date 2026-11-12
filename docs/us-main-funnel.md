# US main funnel

The new `/us` entry copies the main palm-reading journey. Routes under `/us/onboarding` retain the normal layout and steps, with independent browser state, USD prices and Stripe checkout. `/us/discover` is intentionally absent. Existing main, Discover, soulmate and US soulmate funnels retain their gateway and pricing configuration.

## Introductory prices

This is a fixed USD price list, not a live exchange-rate calculation. The initial list converts each Indian final checkout amount (base price × 1.18) at ₹93.75/USD and rounds to cents. It does not add another GST charge at US checkout.

| Bundle | Indian final amount | Current USD total | Suggested launch price, not applied |
| --- | ---: | ---: | ---: |
| Palm Reading | ₹659.62 | $7.04 | $6.99 |
| Palm + Birth Chart | ₹990.02 | $10.56 | $9.99 |
| Palm + Birth Chart + Soulmate Sketch + Future Partner Report | ₹1,886.82 | $20.13 | $19.99 |
| Visible ₹499 add-ons | ₹588.82 | $6.28 | $5.99 |

Hidden/disabled standalone reports stay unavailable. Existing bundle contents are retained. `us_main_settings.prices_usd_cents` holds explicit integer USD cents; the server rejects missing prices and ignores browser-supplied prices. Catalog availability/content was copied from the current Indian pricing configuration; future Indian edits do not automatically change this US list.

## Data and payment lifecycle

- `us_main_orders`: immutable price/product/birth-data snapshots, saved UTM attribution, Stripe identities and fulfillment/tracking stamps.
- `us_main_events`: separate first-party landing/funnel events and browser sessions, with local/preview/production environment.
- `us_main_settings`: independent prices.
- All three tables use RLS and service-role-only access. An order can be inspected by its HttpOnly checkout owner cookie or its authenticated account owner. New-account registration still requires the checkout owner.
- The local environment uses the shared AstroRekha Supabase project. Migrations `20261112010000`, `20261112010100` and `20261112020000` were applied for this task. Existing payment tables were not changed.
- Stripe Checkout, its PaymentIntent and captured Charge must match the stored session, order, funnel, environment, amount and USD currency. A browser success parameter cannot unlock anything.
- `fulfill_us_main_order` atomically grants the existing report-account entitlements and credits once. Duplicate callbacks/reconciliation do not grant again.
- Reports use the existing authenticated account and report-generation screens after registration; order/payment storage remains separate from INR and US soulmate ledgers.
- `/admin/us-main/orders` displays US orders, USD totals and saved attribution. Production is the default environment; Local testing and Preview are separate filters, independent of Stripe live/test mode.

## Configuration before a production launch

US-main environment variables are saved locally and in Vercel Production. The 12 November launch enables `US_MAIN_ENABLED` in production; local external tracking remains disabled.

| Variable | Purpose |
| --- | --- |
| `US_MAIN_ENABLED` | Enable new US checkouts only when `true` |
| `US_MAIN_STRIPE_SECRET_KEY` | Stripe server credential; currently a live credential locally |
| `US_MAIN_APP_ORIGIN` | Public return origin, e.g. `https://astrorekha.com`; dev preserves the actual localhost/127.0.0.1 origin |
| `US_MAIN_STRIPE_WEBHOOK_SECRET` | Dedicated endpoint signing secret; saved locally and in Vercel Production |
| `CRON_SECRET` | Existing authenticated reconciliation cron secret |
| `NEXT_PUBLIC_US_MAIN_TRACKING_ENABLED` | Enable browser advertising events in production only |
| `US_MAIN_TRACKING_ENABLED` | Enable server purchase advertising events in production only |
| `NEXT_PUBLIC_US_MAIN_META_PIXEL_ID` | Explicit pixel destination for this funnel |
| `US_MAIN_META_CAPI_ACCESS_TOKEN` | Token authorized for that pixel |
| `NEXT_PUBLIC_US_MAIN_GA_ID` | Explicit GA4 measurement destination; uses a `us_main` cookie prefix |
| `US_MAIN_GA4_API_SECRET` | Measurement Protocol secret for that GA4 stream |
| `US_MAIN_GA4_MEASUREMENT_ID` | Optional server measurement ID override; must match the browser stream |

First-party events work locally. External GA4 and Meta sends are disabled locally, and production purchase sends also reject local/preview orders. The new funnel does not load the existing GTM container, so its tags cannot accidentally send US events to the old destinations. Its browser GA4/Meta integration and server purchase events use the explicit US-main destinations above. The configured destinations match US Soulmate: Meta pixel `2421426875035260` and GA4 `G-FYRME5NT9Q`, including the existing GA4 Measurement Protocol secret. `US_MAIN_META_CAPI_ACCESS_TOKEN` was supplied and verified on 12 November: Meta accepted one `USMainConnectionTest` event for pixel `2421426875035260` using Test Events mode. No purchase or revenue was sent. Purchase event IDs/transaction IDs are the stable US order ID; browser purchase events are not sent a second time.

Production webhook URL after deployment: `https://astrorekha.com/api/us/main/payment/webhook`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. Local testing can forward Stripe notifications to the same path on the local server, with the forwarding session's signing secret. The existing Stripe webhook must not be replaced.

The new five-minute cron `/api/cron/reconcile-us-main-payments` is inert without the dedicated US-main Stripe configuration. Browser return polling also verifies status directly through Stripe.

## Validation and remaining live checks

Passed: TypeScript, targeted lint (no errors; copied image-optimization warnings), isolated SQL/fulfillment tests, Stripe response/signature/amount/owner checks, checkout idempotency, environment-separated totals, browser USD pricing/navigation, email reset isolation and existing public route smoke checks.

The Stripe credential was checked read-only: authentication and card payments are enabled. A live $1 USD local test completed on 12 November 2026. Stripe captured the charge and the signed webhook fulfilled Palm + Birth Chart and 15 credits in about five seconds. Replaying that same notification locally did not add credits twice. The saved onboarding palm photo was recovered and its generated report persisted across reloads. First-party events and QA UTMs were recorded; production GA4/Meta sends were intentionally suppressed.

Before launch, deploy the endpoint, enable the staged webhook and US checkout, supply the pending Meta CAPI token, and verify final advertising-provider receipt with an appropriately isolated test. Local Stripe credentials are LIVE: submitting card payment charges real money. Do not send test purchases to production advertising accounts or reuse old paid transaction IDs for testing.

## Rollback

Set `US_MAIN_ENABLED=false` to stop new US checkouts. Leave verification/webhook/reconciliation available for already-created payments. Remove entry links if desired. Do not delete fulfilled orders or revoke purchased report access. Existing gateway settings and funnels do not depend on these US tables or this flag.


## Reports dashboard and Elysia account pricing

The shared `/reports`, individual report screens and `/chat` retain their existing layout and generation/credit behavior. Their pricing and tracking market comes from the signed account session and `customer_markets`, not IP location, a browser flag or a user-supplied currency.

A newly paid US-main bundle account is saved as US. Existing Indian paid accounts remain IN even if they subsequently buy a US bundle; the account preference is not overwritten by navigation. US users keep USD pricing when signing back in or using another device. A missing market record defaults to IN. A database/authentication failure disables buying until prices can be loaded rather than guessing a currency.

`GET /api/account/commerce` returns the authenticated account's catalog. US report unlocks, question packs and the unlimited pass use `POST /api/us/main/checkout` with product IDs; the server fixes the buyer, USD amount and entitlements. Indian accounts keep the existing `/api/payments/initiate` flow.

| Account product | Fixed USD price |
| --- | ---: |
| Each available ₹582 standalone report | $6.21 |
| 15 questions / 45 credits | $2.12 |
| 50 questions / 150 credits | $5.43 |
| 100 questions / 300 credits | $8.95 |
| 150 questions / 450 credits | $12.79 |
| 20-minute unlimited Elysia pass | $3.72 |

These account prices convert the existing **final** INR amounts at ₹93.75/USD; they do not apply the bundle's extra 18% calculation. Hidden reports remain hidden. US account prices are stored independently and are not changed automatically by INR pricing edits.

After verified Stripe success, report purchases grant the existing report entitlement, packs add existing credits, and `us_main_chat_passes` records the unlimited time. The browser returns to Reports or Elysia. Duplicate Stripe deliveries do not grant a second time. New tables are service-role-only with RLS. US purchases stay in `us_main_orders`; no INR payment rows are created. Purchased access survives disabling new US checkouts.

Validation for this extension: isolated SQL tests for report unlocks, credit grants, pass duration/replay protection and legacy IN accounts; authenticated catalog and checkout tests rejecting forged identities/browser prices; browser fixtures for US/IN report popups, all four packs and the unlimited pass, confirming each uses its intended endpoint; marketing boundary regressions across report and chat pages. Browser fixtures stopped before any real payment. The later local test verified Stripe, webhook, registration and report recovery as described above. Advertising-provider receipt remains a separate launch check.

## Palm recovery and Stripe promotions (12 November 2026)

Both main onboarding variants and US onboarding now rely on authenticated server-side saving of palm readings. The report page recovers the saved account photo and retries generation without requiring another upload. Generation allows up to two minutes for the AI response within a three-minute route budget; errors retain the input for retry.

New US Stripe sessions allow promotion codes and retain USD (adaptive pricing disabled). The server verifies the original subtotal, discount and captured final amount. The additive migration `20261112030000_us_main_stripe_discounts.sql` stores `paid_amount_cents`; admin totals and purchase tracking use actual paid revenue. Completed zero-total promotions are supported without a payment intent; duplicate fulfillment remains idempotent. Discount scenarios were verified in isolated tests; the live test itself was undiscounted.

The temporary email-specific $1 price, Stripe webhook endpoint and tunnel were removed after verification. The independent unpaid promo preview was expired. No code has been pushed.

## Staged production configuration (12 November 2026)

Dedicated Stripe webhook `we_1UasYXEqAXADRoTPXxMD9BrU` targets `https://astrorekha.com/api/us/main/payment/webhook` with the four Checkout events listed above. It remains **disabled** until the endpoint is deployed. Existing webhook URLs, event subscriptions and enabled states were verified unchanged. Its signing secret and the locally tested Stripe credential are saved as sensitive Vercel Production variables.

Vercel Production has the shared US Soulmate pixel/GA4 destinations and GA4 secret, `US_MAIN_APP_ORIGIN=https://astrorekha.com`, both US-main tracking flags enabled, and `US_MAIN_ENABLED=false`. These saved variables have not been deployed. Local tracking flags remain false. The only missing advertising credential is `US_MAIN_META_CAPI_ACCESS_TOKEN`; server-side Meta purchase delivery cannot be considered ready until it is supplied and verified.

After restarting the local server with the new signing secret, a signed non-payment probe returned HTTP 200 (ignored), while an invalid signature returned HTTP 400. This verifies local signature handling, not production Stripe delivery. No purchase events were resent or new payments created during configuration.

## Production release checks — 12 November 2026

Release prepared from current main with only US-main integration, account currency routing and the tested palm-persistence recovery. Pending admin acquisition, Shiprocket and Paytm queue changes remain excluded. Production build and lint passed (existing warnings only); 15 US/payment/palm tests and 14 security/tracking compatibility tests passed. Browser checks verified US/IN account pricing and checkout routing, US state isolation, existing funnel smoke tests and rejection of forged success redirects. Shared Supabase US tables, pricing and summary RPC were verified read-only. Stripe webhook signature handling and live routes must be checked after deployment; a fresh captured production US purchase remains a separate end-to-end check.

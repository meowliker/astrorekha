# US Soulmate

The complete standalone Soulmate experience is copied to `/us/soulmate`, with checkout at
`/us/soulmate/checkout` and payment confirmation at `/us/soulmate/payment`. Visuals, questions,
package entitlements, report preparation/review and delivery behavior match the existing flow.
Payments use Stripe Checkout, USD and US +1 phone numbers. Prices remain unconfigured until supplied.

## Admin workspace

The existing `/admin` dashboard now includes **US Soulmate workspace** with all four cards:

- Tracking: `/admin/us-soulmate/tracking`
- Orders: `/admin/us-soulmate/orders`
- Analytics: `/admin/us-soulmate/analytics`
- Profit Sheet: `/admin/us-soulmate/profit`

It uses existing admin authentication. Its orders, saved views, advertising accounts, settings,
report jobs, invoices, refunds and profit rows are independent. Copying cards does not copy customers,
credentials or historical records. Tracking contains the same campaign controls and columns.
US ad accounts must be separate from both existing workspaces and use USD billing currency.
Add their credentials through US Profit Sheet settings. Reporting retains the existing IST calendar
and 11:30 IST business-day choices, clearly labeled in the UI.

## Database isolation

`supabase/migrations/20261017140000_us_soulmate.sql` creates 14 private `us_soulmate_*` tables,
US-only functions/triggers and private storage bucket `us-soulmate-sketches-private` in the same
Supabase project. It was applied on 17 October 2026 and recorded in migration history. Existing
application functions were fingerprinted before/after and unchanged; rollback-only SQL fixtures
verified permissions, session ownership, immutability, invoice allocation and job scheduling.

Order IDs start `us_sm_`; invoices start `ARUS-`; the funnel is `us_soulmate_standalone`. All API
writes stay in US tables, including marketing events. The shared `admin_sessions` table is read
for authentication. Existing ad settings are read only to reject shared account IDs.

Browser answers, checkout keys, attribution, analytics sessions and receipt cookies have separate
US names. Main marketing components are excluded on US routes; US Meta events target only the US
pixel. Cross-funnel links use document navigation so vendor globals cannot survive the transition.
Public artwork is reused without changing or copying the original files.

The existing normal and India Soulmate route implementations, payment gateways, environment values,
cron jobs and customer records are unchanged. Shared code changes are limited to adding the admin
workspace, selecting marketing components by route and excluding US landings from main UTM cookies.

## Configuration and launch

Use `docs/us-soulmate.env.example`; add its values alongside existing app variables. No PayU,
main or India Soulmate provider credentials are used as fallbacks. Public values require a rebuild.

1. Supply all six USD prices: standard, express, description, colour, priority and timeline. The
   standard basket has three optional extras; express includes description/colour/priority and has
   the optional timeline. Missing or invalid prices block payment; no default dollar prices exist.
2. Configure dedicated Stripe test credentials and a random receipt secret of at least 32 characters.
   Hosted Checkout needs no publishable key. Set `US_SOULMATE_STRIPE_MODE=test` for test checkout;
   its secret must start `sk_test_`. Live mode requires `sk_live_`.
3. Configure the Stripe endpoint `https://astrorekha.com/api/us/soulmate/payment/webhook`, using API
   version `2024-06-20`, for `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` and `checkout.session.expired`. Store that endpoint's
   signing secret in `US_SOULMATE_STRIPE_WEBHOOK_SECRET`.
4. Set `US_SOULMATE_CHECKOUT_ENABLED=true` only when prices and Stripe setup are ready. Run a Stripe
   test-mode purchase and verify webhook recovery, admin order, USD invoice and purchased outputs.
   For launch, switch the dedicated key, endpoint secret and mode together to live values.
5. Configure US Kie, Anthropic and Brevo keys for reports and delivery. Preparation requires
   `US_SOULMATE_AUTO_REPORTS_ENABLED=true` and `VERCEL_ENV=production`; delivery separately requires
   `US_SOULMATE_DELIVERY_ENABLED=true`. The copied queue schedules new confirmed purchases for eight
   hours after payment, retaining the existing customer-facing 12/48-hour promises. Manual review,
   upload, approval and rescheduling remain available in US Orders.
6. Add dedicated US GA4, Meta and Clarity properties if wanted. Leave blank to omit those trackers.
   US GA4 analytics uses its own service-account envs. Purchase tracking only emits for live orders
   attributed to the production domain. Local tests never create advertising conversions.
7. Schedule the worker endpoints below using a scheduler that can send
   `Authorization: Bearer <US_SOULMATE_CRON_SECRET>`. Do not replace or reuse the existing cron jobs.

| Endpoint | Suggested cadence |
| --- | --- |
| `/api/cron/reconcile-us-soulmate-payments` | Every 5 minutes |
| `/api/cron/prepare-us-soulmate-reports` | Every minute |
| `/api/cron/fulfill-us-soulmate-orders` | Every minute |
| `/api/cron/sync-us-soulmate-profit` | Hourly |

No US cron schedules, Stripe endpoint or production environment variables have been activated by
this change. The code has not been deployed. Existing scheduled jobs do not query US tables.

Stripe sessions use server-built USD cents, isolated order metadata and order-level idempotency.
The return URL does not prove payment: the API retrieves Stripe's session, intent and charge and
checks amount, currency, metadata and live/test mode before recording payment. Signed webhooks
use the same verification. Failed verification never queues delivery; a delayed event cannot
revert a paid order. Refund reporting reconciles only matching live US orders.

No India GST is applied, and Stripe automatic tax is not enabled. Existing schema names such as
`amount_paise`, `spendInr` and `gst_amount` remain internal compatibility fields: US monetary minor
units mean cents, spend is USD at parity, and GST is constrained to zero. Customer-facing and
admin amounts display USD. Existing India-oriented question choices, artwork and report content
are retained as requested; broader US copy/localization and a US reporting timezone are separate
product decisions.

## Verification

- `npm run build`
- `node --test scripts/test-us-soulmate*.cjs` (offline Stripe, report and tracking fixtures)
- `node --test scripts/test-soulmate-*.cjs` (existing Soulmate regression suite)
- `scripts/test-us-soulmate.sql` (transaction rolls back all fixtures)

Offline tests mock Stripe/provider calls and do not prove live account activation, payment-method
eligibility or email deliverability. A real Stripe test-mode integration run awaits credentials.

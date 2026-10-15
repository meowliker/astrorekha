# Standalone soulmate delivery

## Current purchases and manual fulfilment (catalog version 2)

All valid purchases are enabled in local, preview and production code, including optional reports. Prices exclude 18% GST:

- Soulmate Sketch: ₹999, B&W, within 48 hours. Optional description ₹399, colour ₹299, priority ₹249.
- Complete Soulmate Vision: ₹1,499, colour sketch + written description + priority delivery within 12 hours. Optional connection timeline ₹399.
- Priority on the standard package changes its delivery to within 12 hours. No new order has an eight-hour schedule.

Checkout stores the customer's confirmed answers and contacts, server-priced line items, selected extras, final entitlements, GST and payment mode before opening PayU. This snapshot cannot change after checkout. Only verified captured payment marks it paid and creates one generation record and email record. Its scheduled send time is payment time plus 12 hours (express/priority) or 48 hours (normal).

Report generation is **manual for these new orders**. In `/admin/soulmate` → **Orders & delivery**, search a buyer or order and open its details. Upload a PNG/JPEG/WebP sketch and a PDF for each purchased report, open the files for review, then approve the complete order. Limits: 3 MiB per file, 7 MiB combined. Files are private, and review URLs expire after five minutes. Approval freezes the registered files.

The worker waits until the order is approved and its scheduled time is reached. It verifies every required attachment and checksum, then sends the complete bundle to that buyer through Brevo. Approval after the target sends on the next worker run. Missing files never produce a partial email. The dashboard distinguishes submission, confirmed provider send event, delivery and errors; inbox delivery depends on provider processing.

Legacy catalog-version-1 orders retain their existing paid schedules and previous sketch-generation process. Older workers cannot claim new bundles. Future automatic generation must create the files required by each immutable entitlement snapshot before enabling automatic approval.

## Private data and reporting

| Location | Contents |
|---|---|
| `soulmate_sessions` | Draft answers, revision and hashed session secret |
| `soulmate_orders` | Immutable checkout answers/contact/prices, payment status, scheduled send time |
| `soulmate_generation_jobs` | Order ID, prompt/version, provider task ID, retries, private image path/checksum |
| `soulmate_email_deliveries` | Order ID, Brevo batch/message ID, scheduled time and delivery status |
| `soulmate_order_assets` | Purchased file kind, private path, checksum, upload time and size |
| `soulmate-sketches-private` Storage bucket | Private sketches and PDF reports |

These tables use RLS and deny anon/authenticated role access. Only server-side service credentials can read or write them. Draft writes need an unguessable session secret; older revisions cannot overwrite newer answers. Database triggers prevent changes to an existing checkout snapshot. Later chat edits or another checkout cannot overwrite a paid customer's sketch instructions. No answers or recipient details are returned by the payment receipt API.

The main `payments` ledger and marketing flows are not used. Existing standalone transaction filters must be deployed alongside this feature for the live Profit Sheet to exclude these PayU transactions. The future revenue tab should query only these standalone tables. Database/storage backup retention and restore procedures remain a separate operational responsibility.

## Running it

Required environment: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT`, `PAYU_MODE`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `CRON_SECRET` (for hosted routes). `KIE_API_KEY` is only needed for legacy automatic sketch generation. `BREVO_SENDER_NAME` is optional. The Brevo sender/domain must be verified and have transactional sending enabled.

Local: `node scripts/run-soulmate-delivery-worker.cjs` (or add `--once`). It loads `.env.local`, checks missed PayU confirmations every 15 minutes, and runs delivery stages every minute. For new orders, keep this process and the computer awake through the scheduled send time. Restarting resumes saved work. This is a separate process from Next.js.

Hosted: deploy this code and `vercel.json`; `/api/cron/fulfill-soulmate-orders` runs every minute with `CRON_SECRET` bearer authentication, and payment reconciliation every 15 minutes. The hosting plan must support minute-level cron. No production deployment is performed by creating this configuration. Do not run a production launch solely from a laptop.

The queue claims at most three stages per tick, with a five-minute database lease and `SKIP LOCKED`. Multiple worker instances cannot claim the same active job. Provider calls time out, and the worker advances one stage per tick instead of waiting for image generation. Monitor queue latency and increase worker throughput deliberately before high-volume campaigns.

## Failures and review

- Confirmed failed image jobs retry up to three generation attempts. Status/download/storage failures retry with capped backoff; 12 repeated errors require review.
- If a create-task request is interrupted after it may have been accepted, the saved `submitting` state becomes `needs_review`. Check Kie's task history before resubmitting; there is no assumed provider exactly-once guarantee.
- Email submission has a persistent batch/idempotency UUID. After an ambiguous response, the worker recovers the batch/message using Brevo status and order-tagged events, without a second POST. An unresolved outcome requires review. Brevo idempotency keys expire, so never rely on the key alone for a later resend.
- A hard/soft bounce, provider block, or no delivery confirmation after 24 hours requires review. There is no automatic resend loop to an invalid address.
- Saved prompts/images are not deleted on failure. To resume a confirmed failed generation, an operator can reset that generation row to `queued` with `provider_job_id = null`, `failures = 0`, `lease_id = null`, `lease_until = null`, `next_attempt_at = now()` **only after checking for an existing provider job**. To resume a known existing job, set its task ID and `status = 'generating'` instead.
- For ambiguous emails, find the existing Brevo message, set its ID and `status = 'scheduled'`/`'sent'`, then reset the generation job's next attempt and failures. Reset an email to `pending` only after confirming no accepted/scheduled/delivered message exists. Never alter the immutable order answers or change a recipient silently.
- Cron returns HTTP 503 when a run fails or review items exist. Use hosting cron alerts plus the operations query below; external alerting still depends on hosting configuration.

```sql
select o.id, o.payment_mode, o.plan, o.paid_at, o.scheduled_send_at,
       j.status as generation_status, j.provider_job_id, j.storage_path,
       j.last_error as generation_error, e.status as email_status,
       e.provider_message_id, e.last_error as email_error, e.delivered_at
from public.soulmate_orders o
left join public.soulmate_generation_jobs j on j.order_id = o.id
left join public.soulmate_email_deliveries e on e.order_id = o.id
where o.payment_status = 'paid'
order by o.scheduled_send_at;
```

## Validation

`node --test scripts/test-soulmate-payments.cjs scripts/test-soulmate-fulfillment.cjs scripts/test-profit-spend-breakdown.cjs`

`npx tsc --noEmit --pretty false`

The SQL assertions in `scripts/test-soulmate-delivery.sql` must run inside `BEGIN`; they end with `ROLLBACK`. They test session ownership/revision ordering, atomic queueing, duplicate callbacks, job leasing, snapshot immutability and permissions. Fixtures use no provider requests.

References: [Brevo scheduling](https://developers.brevo.com/docs/schedule-batch-sendings), [transactional email API](https://developers.brevo.com/reference/send-transac-email), [batch status](https://developers.brevo.com/reference/get-scheduled-email-by-id), [delivery events](https://developers.brevo.com/reference/get-email-event-report), [idempotency](https://developers.brevo.com/docs/heterogenous-versions-batch-emails), [Kie Nano Banana 2](https://kie.ai/nano-banana-2).

## Admin dashboard

Orders & delivery and Analytics are connected to their isolated soulmate data. The profit sheet remains a placeholder. The old Tracking, System Status and Revenue views are separate. The static “Only 2 slots left” badge does not restrict purchases.

Schema: `20261015210000_soulmate_buyer_items.sql`. Database contract checks: `scripts/test-soulmate-buyer-items.sql` runs with temporary fixtures and rolls back. No real payment or email is sent by the automated regression tests. The owner separately verified a live checkout and confirmation email before release.

## R2 image source

The public page images now use `https://pub-4f25ef2777b741de8ca7d6f9d52414dc.r2.dev/soulmate%20lander/`, matching the owner's uploaded folder name. `soulmateAssetUrl` is scoped to this funnel; `assetUrl` and the main application's existing asset paths are unchanged. `SoulmateImage` renders direct remote URLs with `unoptimized` so these images do not use the Next/Vercel image optimizer. `NEXT_PUBLIC_SOULMATE_ASSET_BASE_URL` can override the full folder URL later.

All 28 public R2 image paths returned HTTP 200 during release validation, including the five checkout images under `checkout/`. The story image `stories/astrorekha-clean-7.png` intentionally uses the owner’s updated R2 version.

Local `public/soulmate/` images remain as backups but are excluded from Git and Vercel uploads. The original ZIP remains a backup, not a byte-exact mirror of the updated R2 image. No private generated customer sketches are moved to this public bucket.

## Order confirmations and invoices

`20261015223000_soulmate_confirmation_invoices.sql` adds a private invoice table and sequence. A verified paid catalog-version-2 order creates one invoice snapshot atomically. Repeated callbacks reuse it; confirmation errors do not downgrade payment. The invoice is rendered with jsPDF, stored in the private bucket with SHA-256 verification, then attached to a branded Brevo email. It is independent of the later 12/48-hour sketch/report email.

Confirmation invoice numbers use `ARS-YY-NNNNNNN`, backed by a database sequence and unique constraint. The number, issue date, buyer/items/amounts snapshot, and saved PDF path/checksum are immutable. View/download requires the normal admin session at `/admin/soulmate` → **Invoices**, or the invoice section within an order. These endpoints do not expose permanent public storage URLs.

Pending invoices retry through the payment-reconciliation cron and local delivery worker. Atomic send claims prevent concurrent duplicate emails. An uncertain submission is flagged for manual provider inspection and is never blindly resent. “Accepted by email provider” is not a delivery receipt.

The owner-requested Complete Soulmate Vision + Timeline example is saved as `source=manual_preview`, with no paid-order record, no transaction, no delivery job, and no contribution to sales/conversion totals. Customer-facing email/PDF has no test label and does not claim payment was received. The normal paid template says “Total paid.” Its one-off script is `scripts/soulmate-confirmation-preview.cjs`; it persists the invoice ID locally, and subsequent sends reuse the guarded invoice record.

The PDF is an order invoice using the existing 18% GST calculation. No GSTIN, legal business address or registration claim has been invented. Business tax-invoice particulars can be added when supplied.

Checks: `node --test scripts/test-soulmate-invoices.cjs` and `supabase db query --linked --file scripts/test-soulmate-invoices.sql` (rolled-back fixtures, no emails). The explicitly requested owner email was sent through Brevo separately from those checks. Production uses these templates after the release deployment completes.

## PayU return compatibility, 15 October 2026

An authenticated PayU verification returned a captured transaction with colons and plus signs in `productinfo` replaced one-for-one with spaces. Exact equality rejected that legitimate transaction in both callback validation and reconciliation. New orders now send an ASCII alphanumeric/space-only gateway description; `line_items` preserve the full customer-facing names. Existing snapshots remain immutable, and matching accepts only the original description or the observed colon/plus substitution. Amount, transaction ID, funnel, plan and order UDFs are still checked. Callback hashes must match the returned or original signed product text; the callback never directly marks payment paid.

Invalid callback signatures no longer show raw JSON or create receipt credentials. A 303 returns to the receipt, where the cookie created during checkout authorizes an independent PayU verification. This handles SameSite=Lax cookies missing from the cross-site POST: the same-origin GET after the redirect sends the original cookie. Missing/invalid cookies still deny access. Missing orders, malformed returns and direct callback refreshes lead to a neutral payment-help page. Confirmed failures, pending verification and uncertain outcomes have separate customer messages; uncertain outcomes never claim payment failed or encourage another payment. Local redirects preserve the original loopback hostname.

Regression fixtures cover all ten product baskets, observed legacy normalization, tampering, bad hashes, authenticated recovery, malformed returns, gateway outages and local host preservation. This prevents the diagnosed failure; it does not guarantee gateway/network uptime. The successful owner purchase was reconciled via the normal PayU verification path, with its original payment timestamp and 12-hour schedule preserved.

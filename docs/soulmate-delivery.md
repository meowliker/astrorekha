# Standalone soulmate delivery

## Automatic preparation and delivery (17 October 2026)

`soulmate-report-plan.ts`, `soulmate-report-providers.ts`, `soulmate-report-pdf.ts` and
`soulmate-report-preparation.ts` provide the reusable preparation pipeline. The dedicated
`/api/cron/prepare-soulmate-reports` worker advances two orders per minute, one resumable stage
per run. It requires `SOULMATE_AUTO_REPORTS_ENABLED=true` AND `VERCEL_ENV=production`.
Local/preview runs do not automatically generate or send. Paid catalog-v2 orders without uploaded
assets enter the queue; this includes unfinished paid orders existing at activation. Manually
uploaded, approved, submitted and delivered orders are excluded. Main-app reports are unrelated.

`20261017100000_soulmate_automatic_reports.sql` adds the private `soulmate_report_jobs` table.
Ten-minute leases prevent concurrent generation. Every checkpoint and final registration checks
payment, answer revision, pending email and the lease under an order lock. Answer edits discard
old unfinished state on the next claim. Prepared PDFs register together and are approved atomically
only after local checks pass. The existing delivery cron sends them at the saved 12/48-hour deadline;
an overdue order sends after preparation succeeds. Paid schedules are never changed.

The owner selected **local checks only**, with no additional AI quality-review request. Generation
prompts require the writer to check image continuity, hypothetical claims, no zodiac assignment,
symbolic initials, distinct paragraphs and current future timing before returning. Code rejects
unvalidated dates, repeated sentences/openings, bad schema/length, unwanted zodiac references,
invalid image dimensions, oversized/corrupted attachments and PDFs exceeding their layout budget.
Image compression retains up to 2048px; B&W is enforced as grayscale. PDF paragraphs and their
headings stay together. One text repair per report is allowed; changing a description invalidates
its dependent timeline. No automatic extra sketch generation is allowed. The pinned image request
is Nano Banana 2, 2K, 12 credits at the checked provider price; no costly fallback or 4K.

Local validation cannot verify every artistic detail or semantic claim. Remaining failures are held
as `needs_review`, shown in the order dashboard, and cause cron HTTP 503. Provider POST outcomes
without a saved response are held rather than blindly retried. Saved Claude responses are recovered
without another request. Kie polling retries the same task; transient failures back off, and a task
still unfinished after two hours is held. Production monitoring should alert on cron failures.

To pause NEW preparation, set `SOULMATE_AUTO_REPORTS_ENABLED=false` and redeploy. Existing approved
deliveries continue through the separate delivery worker. Do not clear an uncertain submission
checkpoint without checking the provider. For content failures, manually upload and approve the
corrected purchased assets, or revise the answers to create a fresh generation revision.

The recipe uses the current paid order's confirmed preference, birth date (converted to adult age),
requested Indian background, desired relationship feeling and emotional context. It uses the
purchased entitlements, not just the plan name: B&W by default, colour when purchased, description
only when purchased. An open-to-either preference gets a stable per-order subject. The initial
unconfirmed preference never overrides the confirmed answer. Buyer name, email, phone, order ID
and exact birth date are not sent to either generation provider.

Credentials (already configured locally) are **SOULMATE_KIE_API_KEY** and
**SOULMATE_ANTHROPIC_API_KEY**. There is no fallback to the original app's keys. The image model
is `nano-banana-2`; the written report uses `claude-sonnet-4-6` and receives the finished drawing
as an image so its appearance section can match it. Missing credentials fail before a submission.
Mocked tests prove workflow invariants, not artistic quality for every preference.

Prepared outputs:

- Sketch PDF: one square page containing only the image. No heading, brand, footer or other text.
- Description PDF: appearance, personality, connection, symbolic initials, work, meeting setting,
  and a broad future window. No embedded sketch or accompaniment subtitle. The full artistic-reading
  disclosure appears at the end. The future window is calculated in code from the current India date
  (or the later planned delivery date), not copied from an old order. Model-written calendar dates
  are rejected. Delayed rendering refreshes the dates without another model request.
- Connection Timeline PDF: six stages of relationship development, generated only when purchased
  and only after the matching description is ready. Claude receives the same finished sketch and
  description; its appearance, initials, career and personality sections must not be repeated.
  The meeting window is inherited exactly internally and displayed as month names and years only;
  later stages go straight into prose without repetitive introductory labels or calendar deadlines.
  The sketch is not embedded. The disclosure remains at the end.
  Source fingerprints prevent rendering against changed inputs. If preparation crosses the
  reference day, the automatic worker refreshes both deterministic month windows together, clears
  previous checks and rerenders. Model-written prose is forbidden from supplying its own dates.

The recipe and answer revision are fingerprinted. Changed preferences or entitlements stop a stale
run. The runner checks payment/review/email state again between stages. Submissions checkpoint
before making billable requests; ambiguous submissions stop for inspection rather than repeating
POSTs. Polling reuses the saved Kie task ID. Outputs have SHA-256 manifests and the same 3 MiB
per-file constraint as existing private attachments. These are staged files, not delivery assets.

Read-only plan (no provider calls, writes, generation or emails):

```sh
node scripts/prepare-soulmate-reports.cjs --order sm_<order-id> --env-file .env.production.local
```

After explicitly authorizing a future manual run, append `--execute` to advance **one** stage.
Repeat that same command to resume; there is no background loop. Output is under gitignored
`output/soulmate-preparation/<order-id>/revision-<n>/`, with private directory/file permissions.
The exclusive `.lock` prevents two local runners submitting the same revision. After a hard crash,
inspect its `state.json` and the provider job before removing a stale lock. Do not reset a
`sketch_submitting`/`description_submitting`/`timeline_submitting` state without checking for an accepted request.
The CLI reads only the selected Soulmate order/email records and never writes to Supabase,
registers attachments, approves, schedules or sends emails.

The manual CLI remains available for explicit local previews; it does not enroll those previews
in automatic delivery. Existing manually approved deliveries are never regenerated or resent.

Validation: `node --test scripts/test-soulmate-report-preparation.cjs` (fixture providers only).
API references: [Kie image jobs](https://docs.kie.ai/market/google/nanobanana2) and
[Claude image input](https://platform.claude.com/docs/en/build-with-claude/vision).

### Approved pencil styles (17 October 2026)

`soulmate-sketch-prompts.ts` now separates coloured-pencil material instructions from B&W graphite.
Both favour visible uneven strokes, open hatching, bare paper highlights and lightly unfinished
shoulders instead of smooth photographic shading. The owner selected **colour A** (`pencil`,
finished pencil) and **B&W B** (`loose`, lighter unfinished study), both with Nano Banana 2 at 2K.
The preparation recipe selects those treatments from the purchased sketch colour.
Its recipe version is `sketch-description-timeline-v5`.
These are reusable prompt styles, not reuse of the sample face. Each buyer still gets their own
confirmed preferences. The subject age range is the buyer's current age minus/plus three years,
with a minimum of 18, calculated from birth date and the current India calendar date. This is a
design convention, not an inferred or predicted partner age. For buyers aged 45 or older, the
prompt also requests age-appropriate smile lines and a few silver strands. Rendered apparent age
is approximate and must be reviewed.

`scripts/compare-soulmate-sketch-styles.cjs` is an explicit manual preview experiment. With no
arguments it only reports the plan. The six-image comparison uses Nano Banana 2 at 2K (four images,
12 credits each) and Seedream 4.5 at basic/2K (two images, 6.5 credits each), with prices checked on
17 October 2026. Never assume this static price check remains current for later experiments.
No request uses 4K, high quality, Nano Banana Pro, or a model above the owner's 12-credit ceiling.
The samples use a fictional mature woman with the same subject brief for both models, not a live
customer order. Exact prompts, task checkpoints and outputs are saved under the gitignored
`output/imagegen/soulmate-pencil-comparison/` directory. Existing checkpoints prevent automatic
duplicate submissions. Recheck current pricing before any future new batch.

## Current purchases and manual fulfilment (catalog version 2)

### Local timeline previews

`scripts/preview-soulmate-timeline.cjs --context file.json --image sketch.jpg --out directory`
validates an explicitly prepared local continuity context without generation. Add `--execute`
and `--env-file .env.production.local` only for an authorized preview. It uses the dedicated Claude
key, checkpoints before the request, saves raw responses for review, and never imports database
or email clients. It can create an owner-requested sample for a buyer who did not buy the add-on;
that does not grant an entitlement or change the order. Asshokk's preview uses his existing
description's 17 April-17 October 2027 meeting window and is kept outside delivered assets.
The prompt and validators live in `src/lib/soulmate-timeline.ts`. Preview scripts never send emails.

All valid purchases are enabled in local, preview and production code, including optional reports. Prices exclude 18% GST:

- Soulmate Sketch: ₹999, B&W, within 48 hours. Optional description ₹399, colour ₹299, priority ₹249.
- Complete Soulmate Vision: ₹1,499, colour sketch + written description + priority delivery within 12 hours. Optional connection timeline ₹399.
- Priority on the standard package changes its delivery to within 12 hours. No new order has an eight-hour schedule.

Checkout stores the customer's confirmed answers and contacts, server-priced line items, selected extras, final entitlements, GST and payment mode before opening PayU. This snapshot cannot change after checkout. Only verified captured payment marks it paid and creates one generation record and email record. Its scheduled send time is payment time plus 12 hours (express/priority) or 48 hours (normal).

Report generation is automatic when the production switch is enabled. Manual upload remains available for exceptions: in the Soulmate orders section, open a buyer's order, upload every purchased file, review and approve. Limits: 3 MiB per file, 7 MiB combined. Files are private, and review URLs expire after five minutes. Approval freezes the registered files.

The worker waits until the order is approved and its scheduled time is reached. It verifies every required attachment and checksum, then sends the complete bundle to that buyer through Brevo. Approval after the target sends on the next worker run. Missing files never produce a partial email. The dashboard distinguishes submission, confirmed provider send event, delivery and errors; inbox delivery depends on provider processing.

Legacy catalog-version-1 orders retain their existing paid schedules and previous sketch-generation process. Older workers cannot claim new bundles. Automatic preparation creates exactly the files in each immutable entitlement snapshot before approval.

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

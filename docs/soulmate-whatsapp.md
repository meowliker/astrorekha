# Soulmate WhatsApp delivery

Two approved Utility FILE templates/API campaigns:

- `soulmate_invoice_delivery_api`: first name, order reference, invoice number, amount in INR (without ₹).
- `soulmate_report_delivery_api`: first name, report name, short description, order reference.

Submission sequence: invoice → sketch → description (if purchased) → timeline (if purchased).
Colour/priority upgrades do not create additional documents. PDFs come from the paid order's existing private storage and must pass checksum checks. AiSensy retrieves each PDF through a 24-hour signed URL. API acceptance is not a delivery receipt or guarantee of handset arrival order.

## Release (not enabled by the local preview)

1. Apply `20261023120000_soulmate_whatsapp_delivery.sql` and `20261023133000_soulmate_whatsapp_invoice_timing.sql`. These add only Soulmate tables/functions/guards.
2. Configure `AISENSY_API_KEY` (existing server secret), the two `SOULMATE_AISENSY_*_CAMPAIGN` names, and an explicit `SOULMATE_WHATSAPP_START_AT` UTC launch time.
3. Enable `SOULMATE_WHATSAPP_ENABLED=true` only when ready to release. Earlier orders are excluded. Confirm checkout's WhatsApp opt-in/recipient preferences before enabling customer sends.
4. The existing Soulmate fulfilment cron processes the email and WhatsApp channels independently. Invoices send immediately for verified paid production/live orders; reports additionally require approval and the scheduled time. It uses the existing backend schedule; it does not change customer delivery promises or email status.

The primary key `(order_id, kind)` and atomic order lock prevent duplicate submissions. Ambiguous responses, interrupted sends and rejected requests require manual review in AiSensy; never delete an accepted log or reset an uncertain send without checking provider history. Subsequent reports are blocked until the earlier messages are accepted. A changed answer revision is not allowed after WhatsApp report submission starts; invoice submission does not lock answers.

## Explicit Anay preview

`node scripts/preview-soulmate-whatsapp.cjs --send-to-anay`

Reads only Anay's paid order and sends only to `919131695346`. Uses the same preparation and dispatch code, with a persistent local ledger in `output/whatsapp/anay-preview-ledger.json` instead of production logs. No migration, automatic worker, historical buyer sends, or email sends are triggered. Keep the ledger to prevent repeated previews. Do not commit credentials, signed URLs, or customer files.


## Immediate confirmations and report timing

Migration `20261023133000_soulmate_whatsapp_invoice_timing.sql` adds the phased queue without replacing the previous queue RPC, allowing safe deployment overlap. After verified payment and saved invoice preparation, the payment confirmation path submits the approved invoice campaign immediately, independently of Brevo. The cron is a fallback for missed invoice submissions. The same launch cutoff and live production eligibility apply to both paths; historical orders are not enrolled.

Reports still require approval and the saved `scheduled_send_at` (8 hours after payment for new catalog orders). Sending an invoice does not lock report answers or invalidate invoice acceptance when answers change. Report submission locks answer revisions. Ambiguous submissions require review, never automatic resend.

Order details show one row per purchased PDF: schedule, submission state, submitted timestamp, and AiSensy acceptance timestamp. A provider HTTP success is **not** proof of sent/delivered/read. On 23 October 2026 the account's Developer Hub required PRO for both Project Webhooks and Project API access; the owner declined upgrading. No receipt integration is configured. The dashboard explicitly marks delivery confirmation unavailable on the current plan and links to AiSensy for manual campaign analytics. Do not infer delivery from accepted responses or downloaded PDFs.

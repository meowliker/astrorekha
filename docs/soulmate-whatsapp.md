# Soulmate WhatsApp delivery

Two approved Utility FILE templates/API campaigns:

- `soulmate_invoice_delivery_api`: first name, order reference, invoice number, amount in INR (without ₹).
- `soulmate_report_delivery_api`: first name, report name, short description, order reference.

Submission sequence: invoice → sketch → description (if purchased) → timeline (if purchased).
Colour/priority upgrades do not create additional documents. PDFs come from the paid order's existing private storage and must pass checksum checks. AiSensy retrieves each PDF through a 24-hour signed URL. API acceptance is not a delivery receipt or guarantee of handset arrival order.

## Release (not enabled by the local preview)

1. Apply `20261023120000_soulmate_whatsapp_delivery.sql`. This adds only Soulmate tables/functions/guard.
2. Configure `AISENSY_API_KEY` (existing server secret), the two `SOULMATE_AISENSY_*_CAMPAIGN` names, and an explicit `SOULMATE_WHATSAPP_START_AT` UTC launch time.
3. Enable `SOULMATE_WHATSAPP_ENABLED=true` only when ready to release. Earlier orders are excluded. Confirm checkout's WhatsApp opt-in/recipient preferences before enabling customer sends.
4. The existing Soulmate fulfilment cron processes the email and WhatsApp channels independently. WhatsApp runs only for verified paid, approved, due production/live orders. It uses the existing backend schedule; it does not change customer delivery promises or email status.

The primary key `(order_id, kind)` and atomic order lock prevent duplicate submissions. Ambiguous responses, interrupted sends and rejected requests require manual review in AiSensy; never delete an accepted log or reset an uncertain send without checking provider history. Subsequent reports are blocked until the earlier messages are accepted. A changed answer revision is not allowed after WhatsApp submission starts.

## Explicit Anay preview

`node scripts/preview-soulmate-whatsapp.cjs --send-to-anay`

Reads only Anay's paid order and sends only to `919131695346`. Uses the same preparation and dispatch code, with a persistent local ledger in `output/whatsapp/anay-preview-ledger.json` instead of production logs. No migration, automatic worker, historical buyer sends, or email sends are triggered. Keep the ledger to prevent repeated previews. Do not commit credentials, signed URLs, or customer files.

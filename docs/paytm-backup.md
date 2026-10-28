# Paytm backup gateway

PayU remains the default. An authenticated administrator can select Paytm in **Admin → Pricing Management → Payment gateway**. This controls new INR report/bundle, add-on, question-pack, unlimited-chat and Indian Soulmate checkouts. US Soulmate continues using Stripe.

This is a manual switch, not an automatic second payment attempt. Existing transactions keep their original gateway even after switching back, preventing an uncertain PayU response from triggering a second charge.

## Configuration and activation

### Local checkout testing

This worktree's ignored `.env.development.local` selects `LOCAL_PAYMENT_GATEWAY=paytm`, `PAYTM_ENABLED=true`, and `PAYTM_CALLBACK_ORIGIN=http://localhost:3114`. Run the development server on port 3114. This override is ignored in production builds and on Vercel; it never updates the shared gateway selector. The local admin gateway save action is blocked while the override is active to protect that shared setting.

The saved credentials are production Paytm credentials, so completing a local checkout charges real money and records a real purchase in the connected database. The browser callback returns to localhost on the same device. Provider webhooks cannot reach localhost; browser callback/status polling verifies local payments. Do not change the production webhook to localhost. Remove the override to restore the shared selector locally.

### Production

Server-only variables in Vercel Production:

- `PAYTM_MID`
- `PAYTM_MERCHANT_KEY` (secret)
- `PAYTM_WEBSITE_NAME=DEFAULT` (use the value assigned by Paytm)
- `PAYTM_ENVIRONMENT=production`
- `PAYTM_ENABLED=true` only when deployment and acceptance testing are ready
- `PAYTM_CALLBACK_ORIGIN=https://astrorekha.com` (optional; this is the default)

Keep PayU credentials and the existing `CRON_SECRET`. Never add `NEXT_PUBLIC_` to payment secrets. The explicit environment picks the matching Paytm API host and prevents verifying a saved test order using production credentials.

Register the successful-payment webhook in the Paytm dashboard as `https://astrorekha.com/api/paytm/webhook`. Checkout supplies `https://astrorekha.com/api/paytm/callback` as the browser return address. These endpoints are included in this release. Do not pay a diagnostic checkout session created by the connection script.

Migration `20261028160000_paytm_backup.sql` adds gateway references, immutable commercial snapshots, verification leases and request counters. Its transaction grants report access/coins and marks fulfillment together; duplicate callbacks cannot refill spent coins. The migration was applied to the AstroRekha Supabase project on 28 October 2026; the active gateway setting was left unchanged (defaults to PayU).

Before activation, complete a controlled real purchase after deployment and confirm the Paytm transaction, correct paid amount, product access, invoice/delivery and one purchase event. Then test a cancelled payment, return/reload, and switch back to PayU. Automated fixtures and a successful API token response do not substitute for a real bank-authorized purchase.

## Verification and recovery

- Prices, GST, purchased products and coins are calculated on the server and saved before opening checkout.
- Paytm's hosted payment page collects payment details. No card details pass through the app.
- Callback checksums are verified. Access is granted only after the signed Status API matches the merchant, order, amount and currency.
- Existing payment recovery screens handle pending, paid and failed outcomes; changing email uses the existing checkout ownership rules.
- The five-minute reconciliation cron retries missed callbacks and incomplete fulfillment, including after switching back to PayU. Browser polling and cron share a database lease to avoid parallel duplicate verification.
- Existing delivery workers, report generation, purchase tracking, invoices, Revenue Dashboard and campaign attribution are reused. Paytm identifiers are stored separately from PayU identifiers.
- A read-only Paytm status probe appears in System Status and uses the existing two-scheduled-failure alert safeguard. It does not simulate a bank payment.

## Refunds

Refunds are initiated manually in the Paytm dashboard, not by this integration. A separate cron runs at minute 17 and 47 and discovers refunds completed in the preceding 29 days. Each refund is checked against the signed Refund Status API and its original local order before storage. Repeated runs deduplicate by Paytm refund ID. Refunds need the gateway's actual timestamp; missing dates never become today's revenue adjustment.

Main-report refunds enter the existing payments ledger as separate negative entries; Soulmate refunds enter its existing refund ledger. The original paid purchase and its delivery/access remain intact, matching the existing separation between finance and fulfillment. Older refunds outside this discovery window need a deliberate backfill. Settlement/payout accounting is still managed in the gateway dashboards.

## Validation commands

`node scripts/check-paytm-connection.cjs` checks configured credentials by creating an **uncharged** ₹1 checkout session, reading its signed status, and reading the refund APIs. It prints no tokens or keys and does not create an app order or fulfil a product.

`node --test scripts/test-paytm-backup.cjs scripts/test-paytm-reconciliation.cjs scripts/test-payment-gateway.cjs` covers API contracts, safety checks, leases, callback recovery and admin controls.

`PGLITE_MODULE=/path/to/@electric-sql/pglite node scripts/test-paytm-migration.cjs` tests the migration in an isolated PostgreSQL-compatible runtime, including transaction rollback and duplicate grants. Install PGlite in a temporary directory for this test; it is not a production dependency.

Browser fixture tests: `scripts/test-paytm-checkout-browser.cjs`, `scripts/test-payu-checkout-browser.cjs`, and `scripts/test-payu-email-checkout-browser.cjs`. They need a locally built server, `QA_BASE_URL`, `PLAYWRIGHT_MODULE` and optionally `CHROMIUM_PATH`. All API/gateway traffic is intercepted; these tests do not charge or write production orders.

`payment_gateway_requests` stores request metadata only. Count attempts by gateway, operation and month to measure API usage; it contains no credentials, signatures or customer payloads. Counter writes are best effort and bounded to two seconds so a logging issue cannot block checkout indefinitely.

### UPI reference compatibility

Paytm's hosted checkout forwards the merchant order ID into the QR's `tr` field. The original report ID format produced 36 characters; the captured failed ₹1 QR contained that full reference. NPCI's published merchant QR guidance limits `tr` to 35 characters. New report orders now use `ptm` plus 24 random hexadecimal characters (27 alphanumeric characters total). Checkout initiation rejects references longer than 35. Old references remain accepted by status, callback, reconciliation and refund lookup so pending attempts are not orphaned. Soulmate IDs already fit the length limit. This corrects a concrete compatibility defect; bank acceptance still requires a successful live test.

Verified live on the HTTPS preview on 28 October 2026: order `ptmf6b492ec3bf96ccb13d84f04` (₹1) succeeded via UPI. Paytm's signed Status API returned `TXN_SUCCESS` / `01`, transaction `20261028010940000322261577331659218`. The verified browser callback arrived at 12:27:30 UTC; atomic fulfillment completed at 12:27:33 UTC and the browser reached the normal successful-payment upsell page. This was the initial preview acceptance test; production selection remains PayU until an administrator changes it.

### Normal-price acceptance test — 28 October 2026

A real ₹659.62 Palm Reading purchase succeeded through the normal localhost checkout using live Paytm credentials. The signed Status API and stored order agree on the merchant transaction and amount (₹559 base plus ₹100.62 GST). Paid access and 15 coins were granted, the Palm Reading report was generated, an invoice was produced, and the invoice WhatsApp send was accepted. Exactly one checkout and one successful-purchase marketing event were recorded. Meta accepted the purchase event.

This was a direct visit without campaign UTMs or Meta click identifiers; campaign attribution was not tested. Localhost had no GA4 server credentials: Google's debug endpoint validated the purchase payload without errors, but this does not prove a live GA4 event was received. Production has the GA4 credentials.

Pre-release checks passed: install, TypeScript, lint, production build, 113 regression tests, isolated SQL migration/atomic-fulfillment checks, mobile Flow A and Flow B Paytm success/failure fixtures, existing PayU recovery/email fixtures, and the mocked admin gateway selector. Valid signed webhook replays returned 200 twice without changing paid access or coin balance; a tampered amount returned 400. A signed replay verifies the endpoint, not Paytm's actual server-to-server notification delivery. US Stripe and complete live purchases of every add-on were not rerun.

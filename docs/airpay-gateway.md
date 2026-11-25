# Airpay hosted checkout integration

Local implementation only. Production payment selection is unchanged. This implements Airpay v4 hosted checkout, not Shiprocket Fastrr.

## Configuration

Server-only environment variables: `AIRPAY_MERCHANT_ID`, `AIRPAY_USERNAME`, `AIRPAY_PASSWORD`, `AIRPAY_API_KEY`, `AIRPAY_CLIENT_ID`, `AIRPAY_CLIENT_SECRET`, `AIRPAY_MODE` (`live` or `test`), `AIRPAY_CALLBACK_ORIGIN`, `AIRPAY_ENABLED`.

Existing merchant credentials were read from the unlocked merchant settings and stored in `.env.airpay.local` (ignored by Git, permissions 0600). Authentication and a no-record status lookup succeeded against Airpay. No charge was created. Keep `AIRPAY_ENABLED=false` until checkout testing. This file is not loaded automatically by Next.js; load it explicitly in an isolated test environment.

Airpay documents status verification as available only for live merchant IDs. Test-mode hosted checkout alone cannot establish safe fulfillment. Never grant access from browser status or IPN status alone.

## Routes to register with Airpay

- Domain: `https://astrorekha.com`
- Success/cancel return: `https://astrorekha.com/api/airpay/callback`
- IPN/webhook: `https://astrorekha.com/api/airpay/webhook`

Checkout supplies a signed state query parameter and the same state in customvar. Airpay must preserve one of these on return. Register the appropriate HTTPS preview origin instead for isolated testing; a local browser address is not a publicly reachable webhook. Do not send live returns to production before this implementation is deployed.

## Fulfillment and recovery

Orders are saved with server-owned prices, gateway, environment, attribution and immutable entitlements before checkout. Authenticated status verification must match merchant, order, environment, INR amount and currency; only captured, non-risk payments unlock reports. Existing invoice, login email, report generation, coins and purchase tracking are reused.

Main order IDs use `arp` plus 24 random hexadecimal characters. Soulmate retains its `sm_` references. US Stripe is unchanged. Browser returns, status polling, webhook and five-minute recovery cron share verification leases and idempotent fulfillment. The SQL migration prevents double grants and changing a paid purchase's identity or commercial fields.

IPNs are checksum-checked and durably stored with minimal identifiers before acknowledgement. Payment events retry independently of the browser. Adjustment/refund/chargeback events remain unprocessed for review and are excluded from the payment recovery queue; they must never be interpreted as new purchases. Automatic Airpay refund reconciliation is NOT implemented. Before general activation, confirm its authenticated refund-status contract with Airpay and implement/reconcile those adjustments, or establish an explicit manual reconciliation process. Do not interpret an unverified refund notification as a financial adjustment.

## Rollout checklist

- [x] Merchant authentication and read-only status lookup.
- [x] Local tests for exact-money validation, callback tampering, delayed capture, duplicate events and atomic grants.
- [x] Migration executed against isolated PostgreSQL-compatible PGlite database.
- [x] Applied and registered `20261125120000_airpay_gateway.sql` on 25 November 2026 for the authorized isolated live test. Verified the public gateway remains Pine Labs.
- [ ] Configure secrets in the deployment; keep Airpay inactive.
- [ ] Register callback/IPN URLs and confirm return-state preservation.
- [ ] Complete one authorized small live payment in an isolated test checkout, verify real response shape, reports, coins, invoice/login email, attribution and duplicate delivery.
- [ ] Resolve refund reconciliation above.
- [ ] Set `AIRPAY_PRODUCTION_VERIFIED=true` only after verification, then enable and select Airpay deliberately through the admin gateway setting.

The migration does not switch gateways. Recovery for already-created orders uses their saved gateway even after switching away.

## Official references

- https://docs.airpay.co.in/v4/payments/simple-transaction/
- https://docs.airpay.co.in/v4/payments/order-confirmation/
- https://docs.airpay.co.in/v4/payments/ipn-callback/
- https://docs.airpay.co.in/v4/getting-started-guide/encryption/

Encryption follows the PHP v4 kit's prefixed IV format, verified with live OAuth. The downloaded Node sample uses a conflicting decrypt-IV derivation and was not copied.

## Live test progress — 25 November 2026

Private local checkout at port 3228 saved one ₹1 INR order for the fresh Airpay test alias, complete birth details and palm input. The bundle snapshot grants its configured reports and 30 bonus coins only after verified payment. Airpay rejected the checkout before payment with **Invalid Domain**. Merchant Business Details lists `https://astrorekha.com`; localhost is not an authorized checkout domain. No payment, entitlement grant or purchase tracking success is claimed. Next step requires Airpay approving a test HTTPS origin/callback or deploying an access-controlled test checkout on the registered site while leaving Pine Labs selected. The current local launcher is intentionally unavailable in production.

## Private production test

`/api/airpay/private-check` is an expiring bearer-link launcher for exactly one existing order. It is controlled by `AIRPAY_PRIVATE_TEST_ENABLED`, `AIRPAY_PRIVATE_TEST_ORDER_ID`, `AIRPAY_PRIVATE_TEST_EMAIL`, `AIRPAY_PRIVATE_TEST_TOKEN` (32 random bytes as hex), and `AIRPAY_PRIVATE_TEST_EXPIRES_AT`. It requires the canonical production origin, live mode, the fixed test attribution, the chosen email and exactly INR 100 paise. It cannot create orders or change catalog prices. A persisted one-time claim prevents concurrent checkout launches; provider status is checked first. `AIRPAY_ENABLED=false` keeps general Airpay selection disabled.

The private link token is a URL fragment removed immediately by the page; it is sent only in an Authorization header to the same-origin launcher. The outgoing payment form uses origin-only referrer information for Airpay's merchant-domain validation.

For this test, the input/order record prepared locally is reused without copying a purchase. If the single launch fails after claiming, investigate the provider status before authorizing any retry. Do not clear a paid transaction or create replacement purchases automatically.

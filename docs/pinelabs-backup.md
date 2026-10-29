# Pine Labs backup gateway

Pine Labs is an optional backup gateway. No production gateway switch is performed by the code or migration. PayU and Paytm remain available, and every existing order continues verification with its saved gateway. US Soulmate purchases remain on Stripe.

## Configuration

Add these server-only values to `.env.local`. Do not use `NEXT_PUBLIC_` names or commit secrets.

```dotenv
PINELABS_CLIENT_ID=<Pine Labs API client ID>
PINELABS_CLIENT_SECRET=<Pine Labs API client secret>
PINELABS_MERCHANT_ID=421588
PINELABS_ENVIRONMENT=production
PINELABS_ENABLED=true
LOCAL_PAYMENT_GATEWAY=pinelabs
PINELABS_CALLBACK_ORIGIN=https://<public-https-callback-host>
```

Use `uat` for UAT credentials. `production` uses live credentials and charges real money, even on localhost. Webhook HMAC verification uses the API client secret as UTF-8 bytes, following Pine Labs’ official WooCommerce plugin. Its Base64 encode/decode example preserves the original secret bytes; do not Base64-decode the client secret itself. No separate `PINELABS_WEBHOOK_SECRET` is required or read. Browser returns use authenticated Order Status API verification, following the official plugin’s approach. They must also carry a checkout-specific return token generated with the client secret and bound to the merchant, environment, origin, order and a 24-hour lifetime. Neither a callback signing secret nor a webhook signing secret needs to be supplied separately. Provider-returned status/signature fields do not grant access. Keep existing PayU credentials, including the salt used by private Soulmate receipt cookies.

`LOCAL_PAYMENT_GATEWAY` is ignored outside development and on Vercel. It does not write the shared gateway setting. The local selector cannot modify that shared setting while an override is present. Restart the development server after changing environment values. For live checkout, use a public HTTPS callback origin. The local test relay exposes only callback/webhook routes and returns the browser to localhost.

## Database and endpoints

Apply `supabase/migrations/20261029130000_pinelabs_backup.sql` to the intended **test database**, after the existing Paytm migration. Point the local application at that test database. This adds an atomic report/credit grant function, guards immutable purchase data, stores Soulmate provider order IDs and creates a private webhook inbox. It does not change the active gateway. Checkout refuses to start without the migration and API credentials.

If local configuration points at production Supabase, applying the migration or testing writes would affect the shared database. The user explicitly approved the shared-database migration and ₹1 test on 29 October 2026; the migration is applied. Production still uses Paytm.

- Browser return: `/api/pinelabs/callback` (GET or POST).
- Signed payment/refund notifications: `/api/pinelabs/webhook` (POST).
- Status and ownership checks use the existing `/api/payments/status` route.
- Recovery: `/api/cron/reconcile-pinelabs-payments`, protected by existing `CRON_SECRET`; deployment schedule is every five minutes.

Pine Labs cannot send webhooks to localhost. For end-to-end local webhook testing, use an approved public HTTPS tunnel to this server, set `PINELABS_CALLBACK_ORIGIN` to its origin, and register `<tunnel-origin>/api/pinelabs/webhook` for the same merchant credentials. The live create-checkout request rejected a localhost callback; a public HTTPS callback relay was used successfully. Browser polling remains local. Do not replace an existing production notification destination with a temporary tunnel.

## Payment and tracking behavior

The app stores the server-calculated price, GST, purchased features, credits and attribution before opening hosted checkout. Its unique merchant reference prevents duplicate provider orders. Status can be recovered by that reference after a timeout. In the live test, repeating creation returned HTTP 422 DUPLICATE_REQUEST, not the original checkout URL; do not rely on duplicate creation to recover the redirect URL.

Only a status API response matching the configured merchant, saved order, environment, full INR amount and processed payment can unlock access. Authorizations and pending payments do not unlock anything. Browser return tokens and webhook signatures are verified; payment is independently checked through the API. Repeated browser checks share a database lease, and the grant runs atomically to prevent duplicate credits. A late failed response cannot downgrade a paid order.

Confirmed report, add-on and chat purchases use existing fulfillment, invoices, saved UTMs, Meta and GA4 purchase paths. The app order ID provides purchase deduplication when no PayU ID exists. Pine Labs sales and refunds appear in the existing profit sheet and gateway revenue breakdown using the same date boundaries. Indian Soulmate orders keep their separate existing fulfillment and finance flow.

Signed webhook IDs are persisted before acknowledgement. Temporary failures remain queued for recovery. The cron also checks unresolved orders from the last 14 days, with a bounded work budget and oldest-check-first ordering. Credentials must remain available to reconcile old Pine Labs purchases after switching to another gateway. API health monitoring checks credential acceptance, not whether a bank will accept a payment; alerts require two consecutive scheduled failures.

Refunds made in Pine Labs are verified through its API and recorded once, using a stable refund ID. They do not automatically revoke purchased reports. Refund recovery depends on receiving a signed refund event: subscribe to refund notifications and test one. If a notification was never received, request a redelivery from Pine Labs or use the provider refund order ID with the recovery script below. There is no claim of complete refund discovery from a global refund-list API.

## Local verification

No payment is generated by these automated fixture tests:

```sh
node --test scripts/test-pinelabs-api.cjs scripts/test-pinelabs-reconciliation.cjs scripts/test-payment-gateway.cjs scripts/test-profit-spend-breakdown.cjs
PGLITE_MODULE=/path/to/@electric-sql/pglite node scripts/test-pinelabs-migration.cjs
QA_BASE_URL=http://127.0.0.1:3161 node scripts/test-pinelabs-checkout-browser.cjs
QA_BASE_URL=http://127.0.0.1:3161 node scripts/test-payment-gateway-browser.cjs
```

Browser tests intercept payment/API traffic and use isolated browser profiles. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` may be supplied for external test runtimes. SQL tests run in an isolated PGlite database, not Supabase.

After adding credentials, `node scripts/check-pinelabs-connection.cjs` checks authentication and schema readiness without creating a charge. To recover a known provider refund: `node scripts/check-pinelabs-connection.cjs --refund <provider-refund-order-id>`; that command verifies the refund and writes its ledger entry idempotently.

Before enabling production, complete an app checkout with a real permitted payment, verify the same order in Pine Labs and the app, check product access/invoice/UTM/purchase delivery and profit-sheet totals, test a cancelled attempt, and test signed webhook delivery plus a refund. The earlier dashboard payment-link test does not establish these app integration results. Settlement into the bank is a separate gateway process.

References: [Hosted checkout](https://www.pinelabs.com/docs/online-payments/hosted-checkout/integration-steps), [create checkout](https://www.pinelabs.com/docs/online-payments/api/checkout/generate-checkout-link), [order lookup](https://www.pinelabs.com/docs/online-payments/api/orders/get-order-by-merchant-reference), [webhook signing](https://www.pinelabs.com/docs/online-payments/developer-tools/webhooks/signature-verification).

## Documentation audit — 29 October 2026

Read the authentication, hosted checkout, callback, order lookup, webhook signature/retry, and dashboard setup guides, and compared the official WooCommerce implementation. Read-only live checks accepted the configured credentials at `https://api.pluralpay.in` and returned merchant 421588’s existing ₹1 payment-link order as PROCESSED. The dashboard guide’s alternate `https://api.pluralonline.com/api/auth/v1/token` returned HTTP 404; retain the working hosted-checkout API host.

Corrected an unnecessary separate webhook-secret requirement using the [official plugin’s verification code](https://github.com/plural-pinelabs/woocommerce-plugin/blob/main/woocommerce-pinepg-gateway/index.php). HMAC verification, timestamp checks, durable event deduplication and independent payment-status/merchant/amount checks remain enforced. Actual delivery of a signed webhook to this integration has not yet been tested. The browser callback now uses API verification and an app-issued return token. The audit itself did not change production settings. The subsequent explicitly approved migration and app payment test are recorded below.

A private `/api/pinelabs/local-check` page can launch exactly one prepared ₹1 order using `PINELABS_LOCAL_TEST_ORDER_ID` and a random 64-hex `PINELABS_LOCAL_TEST_TOKEN` passed in the URL fragment. This endpoint is disabled outside development or on Vercel. It validates the fixed amount, gateway, attribution marker and live mode, and refuses an already paid order. It never changes catalog prices. Remove these two local variables after the test.

## Live local test — 29 October 2026

The user completed a ₹1 live app checkout, reference `pnlc16b1584359e1f503ca42ac8`. Pine Labs returned PROCESSED. The public HTTPS callback reached the local app, independently verified the order through the API, and redirected to payment processing and then bundle upsell. Payment time was 14:57:37 IST; fulfillment was 14:57:49 IST. Credits increased from 18 to 33; repeated reconciliation left them at 33. Palm Reading was already unlocked on this account, so this verifies credit granting and preservation of access, not a new locked-to-unlocked transition.

The purchase_success marketing event retained the test UTM tags. The paid row qualifies for the local profit-sheet Pine Labs revenue query, and the existing invoice builder returns ₹1 with gateway Pine Labs. The shared invoice format currently displays a total without separate GST lines; the payment row retains the test GST snapshot. This format predates Pine Labs.

Local Meta and GA4 server credentials are absent, so this test does not prove delivery to those services (Meta is queued; sent timestamps are empty). No provider webhook delivery was received. Real webhook delivery, refund recovery, and cancellation remain separate acceptance checks before rollout. Production gateway is unchanged and no code has been pushed. The first setup order `pnl9ed185b7bbef16cf053d4494` remains unpaid and must not be used.

## Release verification — 29 October 2026

A subsequent normal local checkout `pnl7706c18d63e0c3ac961978b8` paid ₹659.62 for Palm Reading. Independent Pine Labs API lookup confirmed the exact order, merchant, INR amount and processed transaction. Paid at 15:23:39 IST and fulfilled at 15:23:52 IST. Repeated reconciliation preserved the 15-credit balance. The earlier failed ₹659.62 attempt remained unfulfilled. Invoice generation and the Pine Labs profit-sheet ledger query include the successful order.

The shared Meta retry worker subsequently delivered both the ₹1 test and normal ₹659.62 purchase events (15:00:50 and 15:25:49 IST respectively). GA4 sent timestamps remain empty for these local payments; local GA4 credentials were absent. This does not establish GA4 delivery for those tests.

Production configuration uses `PINELABS_CALLBACK_ORIGIN=https://astrorekha.com` and the six server-only Pine Labs settings. Local-only override/test variables must never be copied to Vercel. Paytm remains the active production gateway. Production webhook URL: `https://astrorekha.com/api/pinelabs/webhook`. Deployment and endpoint verification are recorded separately after rollout.

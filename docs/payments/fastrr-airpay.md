# Fastrr checkout with Airpay

Implemented on 25 November 2026. Migration and production credentials configured; public selection stays on direct Airpay until the Fastrr paid test passes.

## Official contract

Discovered in Fastrr dashboard → Settings → Platform → Custom-Built → Smart One-Click Checkout → Developer Hub.

- API reference: https://documenter.getpostman.com/view/25617008/2sB34bL3ig
- Dashboard guide link: https://docs.google.com/document/d/1uEcKW0uPAldhKiFCqJbAQnAmBTP6Azvlt_Rcxu5BW_0 (requires access; API reference is readable).
- POST `/api/v1/access-token/checkout` creates a token and provider order ID. Custom `catalog_data` sets the price from our saved server quote.
- POST `/api/v1/custom-platform-order/details` verifies order and successful prepaid payment.
- Headers: `X-Api-Key` and `X-Api-HMAC-SHA256`. HMAC is base64 SHA256 over the exact JSON body with the API secret.
- Production API: `https://checkout-api.shiprocket.com`.
- Production SDK: `https://checkout-ui.shiprocket.com/assets/js/channels/shopify.js`, CSS at `/assets/styles/shopify.css`.
- Browser entry: `HeadlessCheckout.addToCart(event, token, { fallbackUrl, isInitiatedFromApp: true })`.
- Return query params `oid` and `ost` are untrusted; `ost` never grants access.
- Official docs recommend polling pending orders even when an order webhook is configured.
- Custom checkout currently supports India only. USD/US checkout continues through Stripe.
- Dashboard pricing states a 2% order-value fee on successful orders, deducted from the Fastrr wallet. Confirm commercial terms with Shiprocket before enabling public checkout.

## Implementation

- Provider name `shiprocket`, displayed as Fastrr (Airpay); direct Airpay remains a separate provider.
- Normal report IDs begin `src`; Soulmate retains its existing `sm_` reference and persisted gateway.
- Reserve a checkout session before the external API call. Concurrent requests share a single provider order. An ambiguous create timeout is not replayed; inspect/recover that reservation first.
- Store encrypted short-lived checkout tokens in server-only `shiprocket_checkout_sessions`. A signed, expiring return state binds account, mode, origin and local order.
- Save the remote order ID before exposing checkout. A failed DB binding can be retried from the same saved session.
- Verify the saved provider ID, catalogue variant, quantity, prepaid success, exact payable and received amounts, Airpay gateway, transaction ID and explicit payment timestamp. Reject extra shipping/COD charges, a different explicit currency, ambiguous captures and partial payment.
- The documented custom API is INR-only; currency fields, when returned, must be INR.
- Shared fulfillment preserves original user/email, birth/palm inputs, purchased features, coins, invoices and saved attribution. Values entered within Fastrr cannot reassign ownership or change entitlements.
- Report/coin grants use an atomic SQL RPC. Existing order-ID-based purchase tracking remains the only purchase dispatch path.
- Webhook payloads trigger an authenticated API read; webhook amounts/status/customer fields are not payment authority.
- Recovery cron `/api/cron/reconcile-shiprocket-payments` runs every five minutes and includes failed/pending and paid-but-unfulfilled report orders over the last 30 days.
- Unknown and failed provider states remain recoverable; no automatic new charge or fallback gateway is initiated.
- Refund/chargeback automation is not implemented for Fastrr. Do not infer a refund from checkout/browser statuses. Handle verified adjustments separately.

## Configuration before a paid test

1. Apply `20261125150000_shiprocket_checkout.sql` (this does not switch the current gateway).
2. Configure server-only values:
   - `SHIPROCKET_CHECKOUT_API_KEY`
   - `SHIPROCKET_CHECKOUT_API_SECRET`
   - `SHIPROCKET_CHECKOUT_ENVIRONMENT=production` (or `staging` with separate staging keys)
   - `SHIPROCKET_CHECKOUT_ORIGIN=https://astrorekha.com`
   - `SHIPROCKET_CHECKOUT_WEBHOOK_SECRET` (independent random value, at least 32 characters)
   - `SHIPROCKET_CHECKOUT_ENABLED=true`
   - Leave `SHIPROCKET_CHECKOUT_PRODUCTION_VERIFIED=false` until the live test passes.
3. Register order webhook `https://astrorekha.com/api/shiprocket/webhook` in Fastrr Custom Endpoints, with `Authorization: Bearer <SHIPROCKET_CHECKOUT_WEBHOOK_SECRET>` as a custom header. If that UI cannot attach an Authorization header, obtain the supported authenticated format from Shiprocket; do not remove authentication. Scheduled API verification is independent of this webhook.
4. Keep only intended prepaid payment methods active. Airpay was observed Active in the dashboard.
5. Confirm zero shipping/COD charges and that Fastrr-side discounts/upsells cannot change our server-priced cart. The code refuses to unlock an amount/cart mismatch; prevent such a mismatch at checkout configuration before testing a real payment.
6. Use a private test order with the real saved purchase/fulfillment snapshot. The standalone SDK preview is not connected to an app purchase and must not be paid.
7. After a successful paid end-to-end test, set the production-verified flag and select Fastrr through the existing gateway settings. Do not modify other pending orders' gateway.

## Evidence / remaining test

- Live credentials successfully authenticated a read-only order-list query.
- Live API generated a ₹1 setup-check token with custom price.
- Actual Fastrr SDK opened locally, displaying AstroRekha's logo, ₹1.00 and the mobile-number step. No payment was made and no app purchase was created by this preview.
- Automated validation covers signature bytes, return tampering/expiry, token encryption, wrong amounts/currency/cart/gateway, ambiguous capture, retry/create races, provider/DB outages, callback/webhook duplication, shared recovery and schema permissions/atomic report grants.
- Production migration applied and server-only credentials configured on 25 November 2026.
- A capability-protected private ₹1 test route uses one pre-created purchase and the shared checkout reservation; it expires after 48 hours and does not change the public gateway.
- Production deployment and authenticated webhook configured. Live ₹1 UPI payment through AirPay succeeded with exact ₹1 received, zero shipping, a single capture and authenticated API confirmation. Fulfillment granted the four saved reports and 30 coins. Replaying two webhooks plus a browser status request preserved fulfillment/tracking timestamps and kept coins at 30.
- The live test revealed that the pre-existing invoice queue allowed only the older gateways. Migration `20261125160000_gateway_purchase_emails.sql` adds direct Airpay and Fastrr while preserving paid/fulfilled/live/identity conditions and invoice deduplication.
- Remaining before public activation: verify delivery of the invoice/login email and open purchased reports in the correct test account.

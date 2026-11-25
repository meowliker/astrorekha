# Shared payment gateway layer

## Scope

The INR normal and Soulmate checkouts now use the same provider registry for PayU,
Paytm and Pine Labs. The registry owns provider configuration, readiness, order ID
generation and checkout wire formats. Existing URLs and browser response formats
are preserved.

Paytm and Pine Labs also share the durable verification/recovery engine. Their
public reconciliation functions remain compatibility wrappers for existing webhook,
polling and cron callers. Provider adapters still authenticate and validate the
merchant, saved reference, mode, amount and currency before fulfillment.

PayU's legacy verification and Stripe's US checkout/verification remain on their
existing paths. This is an incremental extraction, not a replacement of those
working verification implementations. Refund processing also remains provider-specific.
No schema migration or new environment variable is needed for this refactor.

## Payment flow

1. Existing checkout routes validate inputs, calculate prices server-side and save
   the order, report inputs and attribution.
2. `payments/providers.ts` dispatches to the provider saved for that purchase.
   Changing the admin gateway setting affects new orders only.
3. The provider opens its hosted checkout. A timeout never starts another gateway
   automatically: the original order remains available for recovery.
4. Existing authenticated webhook/status/cron handlers request verification.
5. For Paytm/Pine Labs, `payments/reconcile.ts` claims the existing database lease,
   calls the provider verifier and applies the normalized result. Pending/failed
   updates cannot overwrite a paid order. Paid normal orders without fulfillment
   remain eligible for recovery.
6. Existing fulfillment functions grant purchased reports/coins and retain their
   invoice, purchase-event and duplicate protection. Soulmate uses its existing
   background fulfillment queue and confirmation functions.

Never pass a browser-supplied payment-success flag into a recovery adapter. The
adapter is trusted server code, not a public endpoint. Keep signature verification,
provider lookups and saved-order matching at the verification boundary.

## Adding another provider

- Obtain merchant API access, test credentials, order creation/status documentation,
  webhook authentication rules and refund documentation. A hosted payment link and
  redirect alone do not prove a payment succeeded.
- Implement the provider API client and a `PaymentProvider` adapter under
  `src/lib/payments/providers/`. Register it and extend the gateway types.
- Support recovery by our persisted reference after a checkout timeout; if the
  provider cannot do this, design and test its alternative before enabling it.
- Implement verified status normalization through a `RecoveryAdapter`. Preserve
  the saved provider and environment, verify merchant/reference/amount/currency,
  and reject unknown or incomplete success responses.
- Extend the trusted fulfillment bridge for the new provider explicitly. Do not
  label another provider as Paytm or Pine Labs to reuse their verification flags.
- Add any needed database gateway constraints, readiness checks, webhook inbox,
  replay protection and scheduled recovery. Add authenticated refund handling and
  include the new provider in reporting/refund queries where required.
- Preserve the current checkout response contract, or extend the browser checkout
  dispatcher and destination allowlist deliberately. Preserve invoice references,
  order ownership and source/campaign attribution.
- Keep the provider disabled until fixture tests, sandbox checkout, asynchronous
  recovery and a user-authorized production smoke test pass.

Cosmofeed is not enabled by this change. Merchant API access and a supported way to
verify payments are still required. The shared layer reduces application work but
cannot replace those provider capabilities.

## Local regression checks

Use Node 24. These tests use fixtures; they do not charge cards or send real events.

```sh
node --test scripts/test-shared-payment-providers.cjs scripts/test-payment-gateway.cjs scripts/test-pinelabs-reconciliation.cjs scripts/test-paytm-reconciliation.cjs scripts/test-payu-fulfillment-recovery.cjs scripts/test-paytm-api.cjs scripts/test-paytm-backup.cjs scripts/test-pinelabs-api.cjs scripts/test-soulmate-payments.cjs scripts/test-checkout-attribution.cjs scripts/test-us-main-checkout.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

The checks cover legacy response/hash compatibility, saved-provider routing,
invalid amounts/modes, timeouts without fallback, concurrent verification,
forged callbacks, pending and delayed success, fulfillment persistence failures,
refund replay, attribution and existing US Stripe checkout behavior. They do not
constitute a live gateway payment or production browser verification.

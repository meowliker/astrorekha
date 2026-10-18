# US Soulmate checkout

The `/us/soulmate` flow owns its orders, invoices, receipt capabilities, Stripe configuration and tracking. The main and original Soulmate payment flows are unchanged.

## Promotions

The checkout accepts Stripe promotion codes from the configured US Stripe account/mode. Apply validates the email/preferences and creates an unpaid Checkout Session; it never confirms payment. Stripe evaluates coupon expiry, redemption limits, currency and other restrictions. No promotion codes are created automatically.

Use unrestricted, all-product coupons eligible for USD guest purchases. Customer-specific codes and product-restricted coupons are not supported by this guest/inline-price catalog. The current paid-order checkout requires a final total of at least USD 0.50; free orders are not enabled.

Stripe allocates the coupon across product and explicit Tax lines. The server checks every line against the immutable catalog basket, then atomically freezes the product discount, remaining Tax and total before returning the client secret. Checkout, saved order, invoice and payment verification use those amounts. Changing email/cart or removing the code starts a distinct checkout attempt. Apply/Remove refreshes the secure card form, so apply the code before entering card information.

Migration `20261017210000_us_soulmate_promotions.sql` adds the discount snapshot and a service-role-only finalization RPC. The RPC cannot alter an existing Stripe session or a paid order. Existing invoices are unchanged.

## Launch controls

`us-soulmate-automation.ts` keeps report generation and delivery disabled in code. Verified payments may send the confirmation email with its PDF invoice. No activation environment flags are used.

`NEXT_PUBLIC_US_SOULMATE_META_PIXEL_ID` and `US_SOULMATE_META_CAPI_ACCESS_TOKEN` are separate from both older funnels. Leave them blank until the US pixel is available; rebuild after setting the public ID.

The local preview uses live Stripe keys. No real payment or customer email was sent during the promo implementation. A successful charge/webhook/email test remains necessary before production launch. The US application is live-only and rejects test credentials. Offline tests stub all Stripe calls.

## Verification

- `node --test scripts/test-us-soulmate*.cjs`
- `scripts/test-us-soulmate-promotions.sql` runs inside BEGIN/ROLLBACK; fixtures never persist.
- Production build and targeted ESLint/type checks.
- Browser checks for cards before email, promo visibility, missing-email guidance and invalid-code rejection.

Prices are fixed in `src/lib/us-soulmate-prices.ts`, checkout is always enabled, and Stripe always uses live mode. None of these settings require environment variables.

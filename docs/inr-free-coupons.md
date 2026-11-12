# INR complimentary-access coupon

Code: `astrofree` (case insensitive). Anyone who knows it can use it.

Scope: normal INR bundles, including the B paywall's Cosmic Bundle, and available
individual reports/add-ons. Hidden standalone reports remain unavailable. This does
not apply to US accounts, either standalone Soulmate funnel, coin packs or chat passes.

Apply the code on a bundle paywall or individual report purchase popup. The separate
coupon confirmation screen shows ₹0, verifies the account by its existing signed
session (or registration/login), and grants the server catalogue's entitlements.
New bundle accounts also retain their onboarding details and saved palm photo.

Each account can claim each bundle's bonus coins once. Retrying/reloading cannot
grant those coins twice. Existing paid orders, payment identifiers and unlocks are
preserved. Complimentary claims are recorded in `inr_coupon_redemptions` with a
zero total and original catalogue value. They do not create a payment, paid invoice
or Meta/GA4 Purchase event. Existing UTM capture and paid tracking are unchanged.

## Release

Apply `supabase/migrations/20261112200000_inr_free_coupons.sql` before releasing the
code. It is additive and does not rewrite existing payments. The application fails
closed if the migration is missing. No new environment variables are required.

## Disable / rollback

To stop new claims immediately, execute with administrator database access:

```sql
update public.inr_free_coupons set enabled = false where id = 'astrofree-v1';
```

To roll back the UI, revert this feature's code changes. Keep the additive tables
and redemption history. Disabling/reverting does not remove access already granted
or alter any paid order. Do not delete/redeliver payments as part of rollback.

## Verification

`node --test scripts/test-inr-free-coupons.cjs` tests server quotes, scope, identity,
origin checks, revocation and the actual SQL grant transaction in isolated PGlite.
Install PGlite outside the app or set `PGLITE_MODULE` to its local module directory.
The tests use synthetic accounts and never connect to production.

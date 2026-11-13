Orders and source reporting release

The Orders API now pages authoritative Supabase payment records, rather than transferring full history to the application. A service-role-only cache stores each main payment's source label and an attribution fingerprint. Each read refreshes new or changed fingerprints; amounts/status/customer details are read from source tables. No payment triggers, fulfillment changes, or event replay are introduced.

Source badges: FB = Meta; GA = Google Ads; Other = unknown/other; Test = test attribution. Explicit saved source tags take priority; configured Discover/normal entry route mapping is a reporting fallback, not proof of platform attribution.

Rollback: revert the release commit. Leave additive helpers/index/cache in place; old code ignores them. If removing DB objects later, drop read_admin_main_orders first, then admin_main_order_sources and admin_order_source_cache, then admin_order_channel/admin_decode_query and payments_admin_paid_created_id_idx. Restore the previous partner traffic function definition from Git if rolling back the route mapping. Do not alter payment rows, tracking stamps, callbacks or fulfillment.

Google Ads spend remains unconnected. Google spend-dependent metrics are unavailable rather than fabricated. Combined totals identify that spend covers only connected Meta accounts.

Verification (13 November 2026)
- Release verdict: GO. No blocking regressions found.
- TypeScript and production build passed; ESLint: 0 errors, 152 existing warnings.
- 119 source, payment, workspace, checkout and funnel regression checks passed.
- 45 database, report generation, access and recovery checks passed with isolated providers/DB fixtures.
- SQL route-fallback tests passed. Anonymous RPC access denied. Cache repairs and new orders tested.
- Live read comparison: 12,186 main payment records agree. Google: 4 orders, INR 2,968.88.
- Full-history legacy read: 14.7s; Supabase paginated reads: 0.9–1.3s. Local complete page: 2.4–3.3s.
- Browser Orders, Tracking and Profit Sheet matched with no page errors. No real payments, fulfillment callbacks or conversion resends were performed for this release.
- Flow A / Flow B: existing checkout and route regression checks pass. Report unlock / retry checks pass with fixtures; paid generation was not re-purchased during QA.
- The older report-generation test fixture was updated for current signed report sessions, account market and guarded storage updates. Production report handlers were not changed.

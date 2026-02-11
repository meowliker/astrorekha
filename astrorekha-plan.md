# AstroRekha India Launch Plan

Rebrand "PalmCosmic" to "AstroRekha" (astrorekha.com), replace Firebase with Supabase, replace Stripe with Razorpay, update all analytics/email config, and prepare for Vercel deployment targeting India.

---

## Current State Summary

- **Framework**: Next.js 14 (App Router) + TailwindCSS + Zustand
- **Auth/DB**: Firebase Auth + Firestore (client SDK in `src/lib/firebase.ts`, admin SDK in `src/lib/firebase-admin.ts`)
- **Payments**: Stripe (checkout, webhooks, subscriptions, upsells, bundles, coins) — 27 files, 285 matches
- **Email**: Brevo (already integrated) + Nodemailer (OTP emails via Gmail)
- **Analytics**: Meta Pixel, Google Analytics, Microsoft Clarity, Vercel Analytics — all already wired in `layout.tsx`
- **AI**: Anthropic Claude (palm analysis + reading generation)
- **Astro Engine**: Python FastAPI microservice (separate)
- **Branding**: "PalmCosmic" appears in ~49 files (219 matches)

---

## Phase 1: Rebranding (PalmCosmic → AstroRekha)

### 1.1 Global text/string replacements
- `PalmCosmic` → `AstroRekha` across all `.ts`, `.tsx`, `.html` files (~49 source files + 5 HTML legal docs)
- `palmcosmic` → `astrorekha` in localStorage keys, cookie names, zustand persist key, CSS classes
- Key files: `layout.tsx` (metadata), `welcome/page.tsx`, `welcome-b/page.tsx`, `login/page.tsx`, all onboarding steps, email templates in `send-otp/route.ts`, `send-password-reset/route.ts`

### 1.2 Email & domain references
- `hello@palmcosmic.com` → `weatastrorekha@gmail.com` (in `src/lib/brevo.ts`)
- `palmcosmic.com` → `astrorekha.com` (in cron jobs, checkout URLs, fallback URLs)
- `weatpalmcosmic@gmail.com` → `weatastrorekha@gmail.com` (in `.env.local`)

### 1.3 Package & project metadata
- `package.json` name: `palmcosmic` → `astrorekha`

### 1.4 Legal pages (public/Terms/)
- Update all 5 HTML files: `terms-of-service.html`, `privacy-policy.html`, `billing-terms.html`, `money-back-policy.html`, `contact-us.html`

### 1.5 Logo & assets
- Replace `public/logo.png` with AstroRekha logo (you'll need to provide the new logo file)
- Update `alt` text in Image components referencing "PalmCosmic"

---

## Phase 2: Firebase → Supabase Migration

This is the largest change. Firebase is deeply embedded in auth, database, and storage.

### 2.1 Install Supabase dependencies
- Remove: `firebase`, `firebase-admin`
- Add: `@supabase/supabase-js`, `@supabase/ssr` (for Next.js SSR support)

### 2.2 Create Supabase client libraries
- **`src/lib/supabase.ts`** (client-side) — replaces `src/lib/firebase.ts`
  - Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already in `.env.local`)
  - Exports `supabase` client for auth + DB operations
- **`src/lib/supabase-admin.ts`** (server-side) — replaces `src/lib/firebase-admin.ts`
  - Uses `SUPABASE_SERVICE_ROLE_KEY` (new env var needed)
  - Exports admin client for server-side operations

### 2.3 Create Supabase database schema (SQL migrations)
Tables needed (mapping from Firestore collections):
- `users` — user profiles, subscription status, coins, unlocked features
- `user_profiles` — onboarding data, zodiac signs, palm data
- `payments` — payment records
- `otp_codes` — OTP verification codes
- `leads` — abandoned checkout leads
- `horoscopes` — cached horoscope data
- `ab_test_events` / `ab_test_stats` — A/B testing data

### 2.4 Migrate auth flow
- **Current**: Firebase Auth (email/password + custom token) with OTP via Nodemailer
- **New**: Supabase Auth (email OTP built-in, or keep custom OTP with Supabase DB)
- Files to update:
  - `src/app/api/auth/send-otp/route.ts` — use Supabase admin client instead of Firebase Admin
  - `src/app/api/auth/verify-otp/route.ts` — same
  - `src/app/api/auth/send-password-reset/route.ts` — same
  - `src/app/login/page.tsx` — replace Firebase Auth calls
  - `src/app/reset-password/page.tsx` — same
  - `src/components/UserHydrator.tsx` — replace Firestore reads with Supabase queries
  - `src/lib/user-profile.ts` — replace all Firestore doc operations with Supabase table operations
  - `src/lib/user-store.ts` — rename `firebaseUserId` → `userId`, rename `syncFromFirebase` → `syncFromDB`

### 2.5 Migrate all server-side Firestore usage
~53 files import Firebase. Key server routes to update:
- `src/app/api/stripe/webhook/route.ts` (will become Razorpay webhook — Phase 3)
- `src/app/api/admin/revenue/route.ts`
- `src/app/api/admin/sync-sheets/route.ts`
- `src/app/api/admin/login/route.ts`
- `src/app/api/cron/daily-horoscope-email/route.ts`
- `src/app/api/cron/generate-daily-insights/route.ts`
- `src/app/api/cron/generate-horoscopes/route.ts`
- `src/app/api/horoscope/cached/route.ts`
- `src/app/api/prediction-2026/generate-all/route.ts`
- `src/app/api/promo/validate/route.ts`
- `src/app/api/dev/activate-tester/route.ts`
- `src/app/api/ab-test/` routes
- All other routes using `getAdminDb()` or `getAdminAuth()`

### 2.6 Migrate storage
- Palm image uploads currently use Firebase Storage (`getStorage`, `uploadString`, `getDownloadURL`)
- Replace with Supabase Storage buckets
- File: `src/lib/user-profile.ts` → `savePalmImage()`

### 2.7 Middleware update
- `src/middleware.ts` — currently uses cookies only (no Firebase dependency), minimal changes needed

---

## Phase 3: Stripe → Razorpay Migration

### 3.1 Install Razorpay
- Remove: `stripe`
- Add: `razorpay`

### 3.2 New env vars
```
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_...
```

### 3.3 Create Razorpay server library
- **`src/lib/razorpay.ts`** — replaces `src/lib/stripe.ts`

### 3.4 Replace all Stripe API routes (10 routes)
| Current Route | Action |
|---|---|
| `api/stripe/create-checkout/route.ts` | → `api/razorpay/create-order/route.ts` |
| `api/stripe/webhook/route.ts` | → `api/razorpay/webhook/route.ts` |
| `api/stripe/cancel-subscription/route.ts` | → `api/razorpay/cancel-subscription/route.ts` |
| `api/stripe/resume-subscription/route.ts` | → `api/razorpay/resume-subscription/route.ts` |
| `api/stripe/create-upgrade-checkout/route.ts` | → `api/razorpay/create-upgrade-order/route.ts` |
| `api/stripe/create-upsell-checkout/route.ts` | → `api/razorpay/create-upsell-order/route.ts` |
| `api/stripe/create-bundle-checkout/route.ts` | → `api/razorpay/create-bundle-order/route.ts` |
| `api/stripe/create-coin-checkout/route.ts` | → `api/razorpay/create-coin-order/route.ts` |
| `api/stripe/fulfill-checkout-session/route.ts` | → `api/razorpay/verify-payment/route.ts` |
| `api/stripe/resolve-subscription-plan/route.ts` | → `api/razorpay/resolve-subscription-plan/route.ts` |

### 3.5 Key architectural differences (Stripe → Razorpay)
- **Checkout flow**: Stripe redirects to hosted checkout → Razorpay uses an in-page modal (Razorpay.js)
- **Subscriptions**: Razorpay has its own Subscriptions API; trial periods work differently
- **Webhooks**: Different event names (`payment.captured`, `subscription.activated`, etc.)
- **Currency**: All `USD` references → `INR`; prices need India-appropriate values

### 3.6 Update client-side payment pages
- `src/app/(onboarding)/onboarding/step-17/page.tsx` — pricing page (Flow A)
- `src/app/(onboarding)/onboarding/a-step-17/page.tsx` — pricing page (Flow B)
- `src/app/(onboarding)/onboarding/step-18/page.tsx` — post-payment upsell
- `src/app/(onboarding)/onboarding/step-19/page.tsx` — registration after payment
- `src/app/(onboarding)/onboarding/bundle-pricing/page.tsx` — bundle pricing
- `src/app/(onboarding)/onboarding/bundle-upsell/page.tsx` — bundle upsell
- `src/app/(app)/manage-subscription/page.tsx` — subscription management
- `src/app/(app)/paywall/page.tsx` — paywall
- `src/app/(app)/chat/page.tsx` — coin purchase
- `src/components/UpsellPopup.tsx` — upsell popup

### 3.7 Update pixel events
- `src/lib/pixel-events.ts` — change all `currency: "USD"` → `currency: "INR"`, update price values

---

## Phase 4: Environment & Configuration

### 4.1 Update `.env.local`
- Remove: All `STRIPE_*`, `FIREBASE_*` vars
- Add: `RAZORPAY_*`, `SUPABASE_SERVICE_ROLE_KEY`
- Update: `EMAIL_USER` → `weatastrorekha@gmail.com`, `NEXT_PUBLIC_APP_URL` → `https://astrorekha.com`
- Keep: `ANTHROPIC_API_KEY`, `BREVO_*`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_CLARITY_ID`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_*` (sheets)

### 4.2 Update `vercel.json`
- Cron paths remain the same (they're internal API routes)

---

## Phase 5: Analytics & Tracking (Already Integrated — Verify/Update)

These are already wired up in `layout.tsx`. Just need new IDs for the AstroRekha property:
- **Meta Pixel**: Update `NEXT_PUBLIC_META_PIXEL_ID` in env (or keep same if same ad account)
- **Google Analytics**: Update `NEXT_PUBLIC_GA_ID` in env (new GA4 property for astrorekha.com)
- **Microsoft Clarity**: Update `NEXT_PUBLIC_CLARITY_ID` in env (new project)
- **Vercel Analytics**: Works automatically on Vercel deployment

---

## Phase 6: Deployment

### 6.1 Supabase project setup
- Create new Supabase project (or use existing one from env)
- Run SQL migrations to create tables
- Set up Row Level Security (RLS) policies
- Create Storage bucket for palm images
- Configure Supabase Auth settings

### 6.2 Razorpay setup
- Create Razorpay account (India business)
- Set up webhook endpoint: `https://astrorekha.com/api/razorpay/webhook`
- Create subscription plans with INR pricing
- Get API keys

### 6.3 Vercel deployment
- Connect repo to Vercel
- Set custom domain: `astrorekha.com`
- Add all env vars to Vercel project settings
- Deploy

### 6.4 Brevo setup
- Update sender email to `weatastrorekha@gmail.com` (or custom domain sender)
- Update email templates with AstroRekha branding
- Verify sender domain for astrorekha.com

---

## Execution Order (Recommended)

1. **Rebranding** (Phase 1) — lowest risk, can be done first
2. **Supabase migration** (Phase 2) — largest effort, core dependency
3. **Razorpay migration** (Phase 3) — depends on Phase 2 (webhook writes to Supabase)
4. **Env & config** (Phase 4) — done alongside Phases 2-3
5. **Analytics verification** (Phase 5) — quick, done at end
6. **Deployment** (Phase 6) — final step

---

## Questions Before Starting

1. **Pricing for India**: What INR prices do you want for the subscription plans? (e.g., weekly trial, monthly, yearly)
2. **New logo**: Do you have an AstroRekha logo file to replace `public/logo.png`?
3. **Supabase project**: Use the existing Supabase project in `.env.local`, or create a new one?
4. **Razorpay account**: Do you already have Razorpay API keys, or do we set up placeholder config?
5. **New analytics IDs**: Do you have new Meta Pixel, GA4, and Clarity IDs for astrorekha.com, or reuse existing ones?
6. **Astro Engine**: The Python FastAPI microservice — will it be deployed separately (e.g., Railway, Render), or as a Vercel serverless function?
7. **Data migration**: Any existing PalmCosmic user data to migrate from Firebase to Supabase?

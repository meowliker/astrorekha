# AstroRekha Deployment Checklist

## 1. Supabase Setup

### 1.1 Run Schema
- [ ] Go to Supabase Dashboard → SQL Editor
- [ ] Paste and run the contents of `supabase/schema.sql`
- [ ] Verify all 22 tables are created (check Table Editor)

### 1.2 Storage Bucket
- [ ] Go to Storage → Create new bucket
- [ ] Name: `palm-images`
- [ ] Public: **No** (private)

### 1.3 Get Credentials
- [ ] Copy from Settings → API:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (under "service_role" — keep secret!)

### 1.4 Create Admin User
- [ ] Run this SQL in SQL Editor (replace password hash):
```sql
INSERT INTO public.admins (id, password_hash)
VALUES ('admin', '$2b$10$YOUR_BCRYPT_HASH_HERE');
```

---

## 2. Razorpay Setup

- [ ] Create Razorpay account at https://dashboard.razorpay.com
- [ ] Complete KYC verification
- [ ] Get API keys from Settings → API Keys:
  - `RAZORPAY_KEY_ID` (starts with `rzp_live_` or `rzp_test_`)
  - `RAZORPAY_KEY_SECRET`
  - `NEXT_PUBLIC_RAZORPAY_KEY_ID` (same as RAZORPAY_KEY_ID)
- [ ] **No webhook needed** — we use inline checkout with client-side `verify-payment` callback

---

## 3. Vercel Environment Variables

Set ALL of these in Vercel → Project Settings → Environment Variables:

### Supabase
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Razorpay
```
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxxx
```

### App URL
```
NEXT_PUBLIC_APP_URL=https://astrorekha.com
```

### AI
```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### Astrology APIs
```
ASTROLOGY_API_KEY=xxxxx
DIVINE_API_KEY=xxxxx
PROKERALA_CLIENT_ID=xxxxx
PROKERALA_CLIENT_SECRET=xxxxx
```

### Email (Nodemailer OTP)
```
EMAIL_USER=weatastrorekha@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
```

### Analytics
```
NEXT_PUBLIC_META_PIXEL_ID=2260204191172693
NEXT_PUBLIC_CLARITY_ID=v8zh4k92kk
NEXT_PUBLIC_GA_ID=G-4Q1SD1RRCN
```

### Google Sheets Sync
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxxxx@xxxxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
GOOGLE_SHEET_ABANDONED_LEADS=xxxxx
GOOGLE_SHEET_ACTIVE_SUBSCRIBERS=xxxxx
ADMIN_SYNC_SECRET=xxxxx
CRON_SECRET=xxxxx
```

### Brevo (Email Automation)
```
BREVO_API_KEY=xkeysib-xxxxx
BREVO_LIST_ABANDONED_CHECKOUT=7
BREVO_LIST_ACTIVE_SUBSCRIBERS=8
BREVO_TEMPLATE_ABANDONED_CHECKOUT=2
BREVO_TEMPLATE_DAILY_HOROSCOPE=4
```

### Astro Engine
```
ASTRO_ENGINE_URL=https://your-astro-engine-url.com
```

---

## 4. Vercel Deployment

- [ ] Connect GitHub repo to Vercel
- [ ] Set custom domain: `astrorekha.com`
- [ ] Add `www.astrorekha.com` redirect to `astrorekha.com`
- [ ] Verify `vercel.json` crons are active:
  - `/api/admin/sync-sheets` — daily at 6:00 UTC
  - `/api/cron/daily-horoscope-email` — daily at 3:00 UTC
- [ ] Deploy and verify build succeeds

---

## 5. Brevo Setup

- [ ] Verify sender email `weatastrorekha@gmail.com` in Brevo
- [ ] Update email templates with AstroRekha branding
- [ ] Verify list IDs match env vars (Abandoned Checkout = 7, Active Subscribers = 8)
- [ ] Test abandoned checkout automation flow

---

## 6. Post-Deploy Verification

- [ ] Visit `https://astrorekha.com` — homepage loads
- [ ] Complete onboarding flow through bundle-pricing
- [ ] Test Razorpay checkout (use test mode first)
- [ ] Verify payment record appears in Supabase `payments` table
- [ ] Verify user features unlock after payment
- [ ] Test login/registration flow
- [ ] Test chat with coin deduction
- [ ] Verify admin dashboard at `/admin` loads revenue data
- [ ] Check Meta Pixel fires in browser DevTools (Network tab, filter `facebook`)
- [ ] Check Google Analytics real-time view shows visits

---

## 7. Analytics IDs (Update if needed)

If you create new analytics properties for astrorekha.com:
- [ ] Update `NEXT_PUBLIC_META_PIXEL_ID` (or keep same if same ad account)
- [ ] Update `NEXT_PUBLIC_GA_ID` (new GA4 property for astrorekha.com)
- [ ] Update `NEXT_PUBLIC_CLARITY_ID` (new Clarity project)

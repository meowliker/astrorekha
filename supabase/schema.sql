-- AstroRekha Supabase Database Schema (v2 — One-time purchase model with Razorpay)
-- Run this in the Supabase SQL Editor to set up all tables

-- ============================================================
-- 1. USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  
  -- Purchase info (one-time, no subscriptions)
  purchase_type TEXT,                -- 'bundle_payment', 'coins', 'report', 'upsell'
  bundle_purchased TEXT,             -- 'palm-reading', 'palm-birth', 'palm-birth-compat'
  payment_status TEXT,               -- 'paid', 'pending', 'failed'
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  
  -- Coins & Features
  coins INTEGER DEFAULT 0,
  unlocked_features JSONB DEFAULT '{"palmReading": false, "prediction2026": false, "birthChart": false, "compatibilityTest": false}'::jsonb,
  
  -- Onboarding
  onboarding_flow TEXT,
  scans_used INTEGER DEFAULT 0,
  scans_allowed INTEGER,
  
  -- Birth chart timer
  birth_chart_timer_active BOOLEAN DEFAULT FALSE,
  birth_chart_timer_started_at TIMESTAMPTZ,
  
  -- Dev/test
  is_dev_tester BOOLEAN DEFAULT FALSE,
  
  -- A/B test
  ab_variant TEXT,
  
  -- Timezone
  timezone TEXT,
  
  -- Sun sign (for horoscope emails)
  sun_sign TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- ============================================================
-- 2. USER_PROFILES TABLE (replaces Firestore "user_profiles")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id TEXT PRIMARY KEY,
  email TEXT,
  
  -- Onboarding data
  gender TEXT,
  birth_month TEXT,
  birth_day TEXT,
  birth_year TEXT,
  birth_hour TEXT,
  birth_minute TEXT,
  birth_period TEXT CHECK (birth_period IN ('AM', 'PM')),
  birth_place TEXT,
  knows_birth_time BOOLEAN DEFAULT TRUE,
  relationship_status TEXT,
  goals TEXT[] DEFAULT '{}',
  color_preference TEXT,
  element_preference TEXT,
  
  -- Computed/AI data
  zodiac_sign TEXT,
  sun_sign JSONB,
  moon_sign JSONB,
  ascendant_sign JSONB,
  
  -- Palm reading data
  palm_image_url TEXT,
  palm_image TEXT,
  palm_reading_result JSONB,
  palm_reading_date TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- ============================================================
-- 3. OTP_CODES TABLE (replaces Firestore "otp_codes")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.otp_codes (
  email TEXT PRIMARY KEY,
  otp TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. PAYMENTS TABLE (Razorpay one-time payments)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY,                    -- razorpay_payment_id or generated ID
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  user_id TEXT REFERENCES public.users(id),
  type TEXT NOT NULL,                     -- 'bundle_payment', 'upsell', 'coins', 'report'
  bundle_id TEXT,                         -- 'palm-reading', 'palm-birth', 'palm-birth-compat'
  feature TEXT,                           -- specific feature unlocked (e.g. 'prediction2026')
  coins INTEGER,                          -- coins purchased (for coin purchases)
  customer_email TEXT,
  amount INTEGER NOT NULL,                -- amount in paise (INR smallest unit)
  currency TEXT DEFAULT 'INR',
  payment_status TEXT DEFAULT 'created',  -- 'created', 'paid', 'failed'
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order ON public.payments(razorpay_order_id);

-- ============================================================
-- 5. LEADS TABLE (abandoned checkout leads)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leads (
  id TEXT PRIMARY KEY,
  email TEXT,
  gender TEXT,
  age INTEGER,
  birth_month TEXT,
  birth_day TEXT,
  birth_year TEXT,
  zodiac_sign TEXT,
  subscription_status TEXT DEFAULT 'no',
  onboarding_flow TEXT,
  ab_variant TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);

-- ============================================================
-- 6. PALM_READINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.palm_readings (
  id TEXT PRIMARY KEY,
  reading JSONB,
  palm_image_url TEXT,
  birth_date TEXT,
  zodiac_sign TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. CHAT_MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY,
  messages JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. NATAL_CHARTS TABLE (astro-engine calculated charts)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.natal_charts (
  id TEXT PRIMARY KEY,
  chart JSONB,
  dasha JSONB,
  signs JSONB,
  birth_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. BIRTH_CHARTS TABLE (cached birth chart reports)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.birth_charts (
  id TEXT PRIMARY KEY,
  data JSONB,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. DAILY_INSIGHTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_insights (
  id TEXT PRIMARY KEY,
  date TEXT,
  insights JSONB,
  lucky_numbers INTEGER[],
  lucky_colors TEXT[],
  affirmation TEXT,
  mood TEXT,
  energy_level INTEGER,
  focus_area TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. ASTROLOGY_SIGNS_CACHE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.astrology_signs_cache (
  id TEXT PRIMARY KEY,
  data JSONB,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 12. PREDICTIONS_2026_GLOBAL TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.predictions_2026_global (
  id TEXT PRIMARY KEY,
  zodiac_sign TEXT,
  prediction JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 13. ADMINS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admins (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 14. ADMIN_SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES public.admins(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 15. AB_TESTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ab_tests (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT DEFAULT 'active',
  traffic_split NUMERIC DEFAULT 0.5,
  last_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 16. AB_TEST_ASSIGNMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ab_test_assignments (
  id TEXT PRIMARY KEY,
  test_id TEXT REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  visitor_id TEXT,
  variant TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_test ON public.ab_test_assignments(test_id);

-- ============================================================
-- 17. AB_TEST_EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ab_test_events (
  id SERIAL PRIMARY KEY,
  test_id TEXT REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  event_type TEXT NOT NULL,
  visitor_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_events_test ON public.ab_test_events(test_id);

-- ============================================================
-- 18. AB_TEST_STATS TABLE (aggregated)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ab_test_stats (
  id TEXT PRIMARY KEY,
  test_id TEXT REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  bounces INTEGER DEFAULT 0,
  checkouts_started INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 19. COMPATIBILITY TABLE (replaces Firestore "compatibility")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.compatibility (
  id TEXT PRIMARY KEY,
  sign1 TEXT NOT NULL,
  sign2 TEXT NOT NULL,
  overall_score INTEGER,
  emotional_score INTEGER,
  intellectual_score INTEGER,
  physical_score INTEGER,
  spiritual_score INTEGER,
  summary TEXT,
  strengths TEXT[],
  challenges JSONB,
  toxicity_score INTEGER,
  toxicity_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. PREDICTIONS TABLE (replaces Firestore prediction docs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.predictions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. PROMO_CODES TABLE (replaces Firestore "promo_codes")
-- ============================================================
CREATE TABLE IF NOT EXISTS public.promo_codes (
  code TEXT PRIMARY KEY,
  discount_percent INTEGER,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. HOROSCOPE CACHE (replaces Firestore horoscope docs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.horoscope_cache (
  id TEXT PRIMARY KEY,
  sign TEXT NOT NULL,
  date TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_horoscope_sign_date ON public.horoscope_cache(sign, date);

-- ============================================================
-- STORAGE: Create a bucket for palm images
-- ============================================================
-- Run in Supabase Dashboard > Storage > Create bucket:
--   Name: palm-images
--   Public: false

-- ============================================================
-- RLS POLICIES
-- ============================================================
-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.palm_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.natal_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.birth_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrology_signs_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions_2026_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horoscope_cache ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ANON (client-side) policies
-- The app uses the anon key from the browser for direct reads/writes.
-- Service role key is used only in API routes (server-side).
-- ============================================================

-- USERS: anon can read/insert/update (client creates & hydrates user)
CREATE POLICY "anon_users_select" ON public.users FOR SELECT USING (true);
CREATE POLICY "anon_users_insert" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_users_update" ON public.users FOR UPDATE USING (true);
CREATE POLICY "anon_users_delete" ON public.users FOR DELETE USING (true);

-- USER_PROFILES: anon can read/insert/update
CREATE POLICY "anon_user_profiles_select" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "anon_user_profiles_insert" ON public.user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_user_profiles_update" ON public.user_profiles FOR UPDATE USING (true);

-- OTP_CODES: anon can insert/read (send-otp and verify-otp from client)
CREATE POLICY "anon_otp_select" ON public.otp_codes FOR SELECT USING (true);
CREATE POLICY "anon_otp_insert" ON public.otp_codes FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_otp_update" ON public.otp_codes FOR UPDATE USING (true);

-- PAYMENTS: anon can read own payments, insert handled by server
CREATE POLICY "anon_payments_select" ON public.payments FOR SELECT USING (true);
CREATE POLICY "anon_payments_insert" ON public.payments FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_payments_update" ON public.payments FOR UPDATE USING (true);

-- LEADS: anon can insert (step-15 saves lead from client)
CREATE POLICY "anon_leads_insert" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_leads_select" ON public.leads FOR SELECT USING (true);

-- PALM_READINGS: anon can read/insert/update/delete
CREATE POLICY "anon_palm_readings_all" ON public.palm_readings FOR ALL USING (true);

-- CHAT_MESSAGES: anon can read/insert/update
CREATE POLICY "anon_chat_messages_all" ON public.chat_messages FOR ALL USING (true);

-- NATAL_CHARTS: anon can read (loaded in chat)
CREATE POLICY "anon_natal_charts_select" ON public.natal_charts FOR SELECT USING (true);
CREATE POLICY "anon_natal_charts_insert" ON public.natal_charts FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_natal_charts_update" ON public.natal_charts FOR UPDATE USING (true);

-- BIRTH_CHARTS: anon can read/insert (cached chart reports)
CREATE POLICY "anon_birth_charts_select" ON public.birth_charts FOR SELECT USING (true);
CREATE POLICY "anon_birth_charts_insert" ON public.birth_charts FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_birth_charts_update" ON public.birth_charts FOR UPDATE USING (true);

-- DAILY_INSIGHTS: anon can read
CREATE POLICY "anon_daily_insights_select" ON public.daily_insights FOR SELECT USING (true);

-- ASTROLOGY_SIGNS_CACHE: anon can read
CREATE POLICY "anon_astrology_cache_select" ON public.astrology_signs_cache FOR SELECT USING (true);

-- PREDICTIONS_2026_GLOBAL: anon can read
CREATE POLICY "anon_predictions_2026_select" ON public.predictions_2026_global FOR SELECT USING (true);

-- COMPATIBILITY: public read
CREATE POLICY "anon_compatibility_select" ON public.compatibility FOR SELECT USING (true);
CREATE POLICY "anon_compatibility_insert" ON public.compatibility FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_compatibility_update" ON public.compatibility FOR UPDATE USING (true);

-- HOROSCOPE_CACHE: public read
CREATE POLICY "anon_horoscope_cache_select" ON public.horoscope_cache FOR SELECT USING (true);

-- PROMO_CODES: anon can read (validate promo from client)
CREATE POLICY "anon_promo_codes_select" ON public.promo_codes FOR SELECT USING (true);

-- PREDICTIONS: anon can read
CREATE POLICY "anon_predictions_select" ON public.predictions FOR SELECT USING (true);

-- AB_TESTS: anon can read (client fetches variant)
CREATE POLICY "anon_ab_tests_select" ON public.ab_tests FOR SELECT USING (true);

-- AB_TEST_ASSIGNMENTS: anon can read/insert (client saves assignment)
CREATE POLICY "anon_ab_assignments_select" ON public.ab_test_assignments FOR SELECT USING (true);
CREATE POLICY "anon_ab_assignments_insert" ON public.ab_test_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_ab_assignments_update" ON public.ab_test_assignments FOR UPDATE USING (true);

-- Additive WhatsApp capture/storage support.
-- Safe to run on existing production data: all column additions are guarded,
-- and the new tables are append-only infrastructure for the AiSensy phase.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS relationship_status TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birth_month TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birth_day TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birth_year TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS moon_sign TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ascendant_sign TEXT;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source TEXT;

CREATE TABLE IF NOT EXISTS public.whatsapp_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  email TEXT,
  whatsapp_number TEXT NOT NULL,
  whatsapp_e164 TEXT NOT NULL UNIQUE,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_opt_in_at TIMESTAMPTZ,
  whatsapp_opt_in_source TEXT,
  unlocked_features JSONB NOT NULL DEFAULT '{}'::jsonb,
  zodiac_sign TEXT,
  sun_sign TEXT,
  moon_sign TEXT,
  ascendant_sign TEXT,
  birth_day TEXT,
  birth_month TEXT,
  birth_year TEXT,
  timezone TEXT,
  last_confirmation_sent_at TIMESTAMPTZ,
  last_invoice_sent_at TIMESTAMPTZ,
  last_horoscope_sent_at TIMESTAMPTZ,
  aisensy_contact_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_subscribers_user_id ON public.whatsapp_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_subscribers_email ON public.whatsapp_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_whatsapp_subscribers_zodiac ON public.whatsapp_subscribers(zodiac_sign);
CREATE INDEX IF NOT EXISTS idx_whatsapp_subscribers_status ON public.whatsapp_subscribers(status);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  whatsapp_e164 TEXT,
  email TEXT,
  message_type TEXT NOT NULL,
  aisensy_campaign_name TEXT,
  template_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user_id ON public.whatsapp_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_whatsapp_e164 ON public.whatsapp_messages(whatsapp_e164);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_type_status ON public.whatsapp_messages(message_type, status);

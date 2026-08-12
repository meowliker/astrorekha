ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_dedupe_key
  ON public.whatsapp_messages(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

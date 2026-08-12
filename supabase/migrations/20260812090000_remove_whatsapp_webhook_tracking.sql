DROP INDEX IF EXISTS public.idx_whatsapp_messages_provider_message_id;

ALTER TABLE public.whatsapp_messages
  DROP COLUMN IF EXISTS provider_message_id,
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS read_at,
  DROP COLUMN IF EXISTS failed_at,
  DROP COLUMN IF EXISTS last_webhook_at,
  DROP COLUMN IF EXISTS last_webhook_payload;

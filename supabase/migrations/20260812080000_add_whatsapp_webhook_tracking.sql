ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_payload JSONB;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider_message_id
  ON public.whatsapp_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

UPDATE public.whatsapp_messages
SET provider_message_id = COALESCE(
  NULLIF(response->>'submitted_message_id', ''),
  NULLIF(response->>'submittedMessageId', ''),
  NULLIF(response->>'message_id', ''),
  NULLIF(response->>'messageId', '')
)
WHERE provider_message_id IS NULL
  AND response IS NOT NULL
  AND (
    response ? 'submitted_message_id'
    OR response ? 'submittedMessageId'
    OR response ? 'message_id'
    OR response ? 'messageId'
  );

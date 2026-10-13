-- Private change tracking for the revenue dashboard. No payment payloads or chat text.
CREATE TABLE public.admin_revenue_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL CHECK (table_name IN ('payments', 'marketing_events', 'users', 'chat_messages')),
  record_id text NOT NULL,
  version uuid NOT NULL DEFAULT gen_random_uuid(),
  UNIQUE (table_name, record_id)
);
CREATE TABLE public.admin_revenue_sync_state (
  id text PRIMARY KEY CHECK (id = 'dashboard'),
  snapshot_id uuid,
  generated_at timestamptz,
  source_version integer,
  lease_token uuid,
  lease_expires_at timestamptz
);
INSERT INTO public.admin_revenue_sync_state (id) VALUES ('dashboard');
ALTER TABLE public.admin_revenue_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_revenue_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_revenue_changes, public.admin_revenue_sync_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_revenue_changes, public.admin_revenue_sync_state TO service_role;

CREATE FUNCTION public.admin_revenue_track_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  affected_ids text[];
  affected_id text;
BEGIN
  IF TG_TABLE_NAME = 'marketing_events' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.event_name NOT IN ('product_offer_view', 'upsell_view', 'chat_unlimited_offer_shown') THEN RETURN NULL; END IF;
    ELSIF TG_OP = 'DELETE' THEN
      IF OLD.event_name NOT IN ('product_offer_view', 'upsell_view', 'chat_unlimited_offer_shown') THEN RETURN NULL; END IF;
    ELSIF OLD.event_name NOT IN ('product_offer_view', 'upsell_view', 'chat_unlimited_offer_shown') AND
          NEW.event_name NOT IN ('product_offer_view', 'upsell_view', 'chat_unlimited_offer_shown') THEN
      RETURN NULL;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN affected_ids := ARRAY[OLD.id::text];
  ELSIF TG_OP = 'UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN affected_ids := ARRAY[OLD.id::text, NEW.id::text];
  ELSE affected_ids := ARRAY[NEW.id::text];
  END IF;
  FOREACH affected_id IN ARRAY affected_ids LOOP
    INSERT INTO public.admin_revenue_changes (table_name, record_id)
    VALUES (TG_TABLE_NAME, affected_id)
    ON CONFLICT (table_name, record_id) DO UPDATE SET version = gen_random_uuid();
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_revenue_track_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER admin_revenue_changes AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.admin_revenue_track_change();
CREATE TRIGGER admin_revenue_changes AFTER INSERT OR UPDATE OR DELETE ON public.marketing_events FOR EACH ROW EXECUTE FUNCTION public.admin_revenue_track_change();
CREATE TRIGGER admin_revenue_changes AFTER INSERT OR UPDATE OR DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.admin_revenue_track_change();
CREATE TRIGGER admin_revenue_changes AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.admin_revenue_track_change();

-- A lease prevents an older concurrent refresh from overwriting newer saved data.
CREATE FUNCTION public.admin_revenue_begin_sync() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result jsonb;
BEGIN
  UPDATE public.admin_revenue_sync_state
  SET lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + interval '6 minutes'
  WHERE id = 'dashboard' AND (lease_token IS NULL OR lease_expires_at < clock_timestamp())
  RETURNING to_jsonb(admin_revenue_sync_state.*) || jsonb_build_object('sync_at', clock_timestamp()) INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'A revenue refresh is already running'; END IF;
  RETURN result;
END;
$$;

-- Publishing and acknowledging exact change versions happen in the same transaction.
-- An update committed during the refresh gets a new version and remains queued.
CREATE FUNCTION public.admin_revenue_commit_sync(p_token uuid, p_snapshot_id uuid, p_generated_at timestamptz, p_source_version integer, p_ack jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.admin_revenue_sync_state
  SET snapshot_id = p_snapshot_id, generated_at = p_generated_at, source_version = p_source_version,
      lease_token = NULL, lease_expires_at = NULL
  WHERE id = 'dashboard' AND lease_token = p_token AND lease_expires_at > clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'Revenue refresh lease expired; saved snapshot was not changed'; END IF;
  DELETE FROM public.admin_revenue_changes AS changes
  USING jsonb_to_recordset(p_ack) AS ack(id uuid, version uuid)
  WHERE changes.id = ack.id AND changes.version = ack.version;
END;
$$;
CREATE FUNCTION public.admin_revenue_release_sync(p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.admin_revenue_sync_state SET lease_token = NULL, lease_expires_at = NULL
  WHERE id = 'dashboard' AND lease_token = p_token;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_revenue_begin_sync(), public.admin_revenue_commit_sync(uuid, uuid, timestamptz, integer, jsonb), public.admin_revenue_release_sync(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_begin_sync(), public.admin_revenue_commit_sync(uuid, uuid, timestamptz, integer, jsonb), public.admin_revenue_release_sync(uuid) TO service_role;

-- Recent-window reads follow the date index; ID makes equal timestamps stable.
CREATE INDEX IF NOT EXISTS idx_revenue_payment_date_id ON public.payments (created_at, id);
CREATE INDEX IF NOT EXISTS idx_revenue_offer_date_id ON public.marketing_events (created_at, id)
WHERE event_name IN ('product_offer_view', 'upsell_view', 'chat_unlimited_offer_shown');
NOTIFY pgrst, 'reload schema';

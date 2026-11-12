-- Support recovery records the latest chart calculation separately from creation.
-- Existing customer charts and their creation timestamps remain intact.
begin;
alter table public.natal_charts add column if not exists calculated_at timestamptz;
notify pgrst, 'reload schema';
commit;

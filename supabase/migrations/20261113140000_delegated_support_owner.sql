begin;
-- Permission is checked from the active staff row on every request, including existing tokens.
-- Default false preserves every other operator's existing API authority.
alter table public.support_staff add column if not exists api_owner_access boolean not null default false;
alter table public.support_staff add constraint support_api_owner_requires_owner check (not api_owner_access or role='owner');
notify pgrst, 'reload schema';
commit;

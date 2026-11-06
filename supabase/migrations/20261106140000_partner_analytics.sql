create table public.partner_analytics_viewers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and length(email) between 3 and 254),
  label text not null check (length(label) between 1 and 100),
  password_hash text not null check (password_hash ~ '^[a-f0-9]{64}$'),
  active boolean not null default true,
  traffic boolean not null default false,
  purchases boolean not null default false,
  revenue boolean not null default false,
  channels boolean not null default false,
  session_version bigint not null default 1,
  created_at timestamptz not null default now()
);

create table public.partner_analytics_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  viewer_id uuid not null references public.partner_analytics_viewers(id) on delete cascade,
  session_version bigint not null,
  expires_at timestamptz not null
);
create index partner_analytics_sessions_expiry_idx on public.partner_analytics_sessions (expires_at);

create table public.partner_analytics_login_limits (
  key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
create index partner_analytics_login_expiry_idx on public.partner_analytics_login_limits (expires_at);

alter table public.partner_analytics_viewers enable row level security;
alter table public.partner_analytics_sessions enable row level security;
alter table public.partner_analytics_login_limits enable row level security;
revoke all on public.partner_analytics_viewers, public.partner_analytics_sessions, public.partner_analytics_login_limits
  from public, anon, authenticated;
grant select, insert, update on public.partner_analytics_viewers to service_role;
grant select, insert, delete on public.partner_analytics_sessions to service_role;

create function public.bump_partner_analytics_session_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.password_hash is distinct from old.password_hash or new.active is distinct from old.active then
    new.session_version := old.session_version + 1;
  end if;
  return new;
end;
$$;
create trigger partner_analytics_viewer_revoke before update on public.partner_analytics_viewers
  for each row execute function public.bump_partner_analytics_session_version();

create function public.allow_partner_analytics_login(p_key text, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare used integer;
begin
  delete from public.partner_analytics_login_limits where expires_at < now() - interval '1 day';
  insert into public.partner_analytics_login_limits as counter (key, attempts, expires_at)
  values (p_key, 1, now() + interval '15 minutes')
  on conflict (key) do update
    set attempts = case when counter.expires_at <= now() then 1 else least(counter.attempts + 1, p_limit + 1) end,
        expires_at = case when counter.expires_at <= now() then excluded.expires_at else counter.expires_at end
  returning attempts into used;
  return used <= p_limit;
end;
$$;
revoke all on function public.allow_partner_analytics_login(text,integer) from public, anon, authenticated;
grant execute on function public.allow_partner_analytics_login(text,integer) to service_role;

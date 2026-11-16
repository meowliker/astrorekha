-- Additive, private recovery/email ledger. Never changes payment or entitlement records.
create table public.purchase_access_config (
 id boolean primary key default true check(id), enabled boolean not null default true,
 starts_at timestamptz not null default now()
);
insert into public.purchase_access_config(id) values(true);
create table public.purchase_access_emails (
 id uuid primary key default gen_random_uuid(), source text not null check(source in ('IN','US')),
 order_id text not null, user_id text not null references public.users(id) on delete cascade, email text not null,
 amount_minor bigint not null check(amount_minor>0), currency text not null check(currency in ('INR','USD')),
 code_nonce uuid not null default gen_random_uuid(), code_hash text, invoice_snapshot jsonb,
 unique(email,code_hash),
 used_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
 status text not null default 'queued' check(status in ('queued','sending','retry','sent','failed','needs_review')),
 attempts integer not null default 0, claim_id uuid, claimed_at timestamptz,
 first_attempt_at timestamptz, next_attempt_at timestamptz not null default now(), sent_at timestamptz,
 provider_message_id text, last_error text, unique(source,order_id)
);
create index purchase_access_email_queue on public.purchase_access_emails(status,next_attempt_at);
create table public.purchase_access_attempts (bucket text primary key, window_start timestamptz not null, attempts integer not null);
create table public.purchase_password_grants (
 token_hash text primary key, user_id text not null references public.users(id) on delete cascade,
 created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '15 minutes'), used_at timestamptz
);
alter table public.purchase_access_config enable row level security;
alter table public.purchase_access_emails enable row level security;
alter table public.purchase_access_attempts enable row level security;
alter table public.purchase_password_grants enable row level security;
revoke all on public.purchase_access_config,public.purchase_access_emails,public.purchase_access_attempts,public.purchase_password_grants from public,anon,authenticated;
grant all on public.purchase_access_config,public.purchase_access_emails,public.purchase_access_attempts,public.purchase_password_grants to service_role;

create function public.enqueue_purchase_access_emails() returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.purchase_access_emails(source,order_id,user_id,email,amount_minor,currency)
 select s.source,s.id,s.user_id,lower(trim(u.email)),s.amount,s.currency
 from (
   select 'IN' as source,p.id,p.user_id,p.customer_email,p.amount::bigint as amount,'INR' as currency,p.created_at
   from public.payments p,public.purchase_access_config c
   where c.id and c.enabled and p.fulfilled_at>=c.starts_at and p.payment_status='paid' and p.fulfilled_at is not null
     and p.amount>0 and p.currency='INR' and p.type in ('bundle','bundle_payment','report','upsell','coins','chat_pass')
     and p.id !~ '^(sm_|us_sm_)' and coalesce(to_jsonb(p)->>'payment_mode','live')='live'
     and coalesce(to_jsonb(p)->>'utm_source','')<>'codex_qa'
     and coalesce(to_jsonb(p)->'metadata'->>'trackingEnvironment','production')='production'
     and coalesce(to_jsonb(p)->>'landing_url','') !~* '^https?://(localhost|127\.0\.0\.1)(:|/|$)'
     and coalesce(to_jsonb(p)->>'gateway','payu') in ('payu','paytm','pinelabs')
   union all
   select 'US',p.id,p.user_id,p.customer_email,coalesce(p.paid_amount_cents,p.amount_cents)::bigint,'USD',p.created_at
   from public.us_main_orders p,public.purchase_access_config c
   where c.id and c.enabled and p.fulfilled_at>=c.starts_at and p.payment_status='paid' and p.fulfilled_at is not null
     and coalesce(p.paid_amount_cents,p.amount_cents)>0 and p.payment_mode='live'
     and p.attribution->>'trackingEnvironment'='production'
 ) s join public.users u on u.id=s.user_id
 where lower(trim(u.email))=lower(trim(s.customer_email)) and u.email like '%@%'
   and not exists(select 1 from public.purchase_access_emails e where e.source=s.source and e.order_id=s.id)
 order by s.created_at,s.id limit 100
 on conflict(source,order_id) do nothing;
 get diagnostics n=row_count;
 return n;
end $$;

create function public.claim_purchase_access_emails(p_claim uuid,p_limit integer default 5)
returns setof public.purchase_access_emails language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.purchase_access_config where id and enabled) then return; end if;
 -- Never retry an ambiguous delivery beyond the short provider idempotency window.
 update public.purchase_access_emails set status='needs_review',last_error='delivery_not_confirmed'
 where status in ('sending','retry') and (first_attempt_at<now()-interval '10 minutes' or attempts>=5)
   and (claimed_at is null or claimed_at<now()-interval '2 minutes');
 return query
 with chosen as (
   select id from public.purchase_access_emails
   where (status in ('queued','retry') and next_attempt_at<=now())
      or (status='sending' and claimed_at<now()-interval '2 minutes' and first_attempt_at>=now()-interval '10 minutes')
   order by created_at limit greatest(1,least(p_limit,5)) for update skip locked
 ) update public.purchase_access_emails e set status='sending',claim_id=p_claim,claimed_at=now(),
   first_attempt_at=coalesce(e.first_attempt_at,now()),attempts=e.attempts+1
 from chosen c where e.id=c.id returning e.*;
end $$;

create function public.consume_purchase_access_code(p_email text,p_code_hash text,p_ip_hash text,p_grant_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare bucket_key text; tries integer; r public.purchase_access_emails%rowtype;
begin
 -- Serialize attempts and consumption for this email, including concurrent requests from two devices.
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_email)),117));
 foreach bucket_key in array array['ip:'||p_ip_hash, 'email:'||md5(lower(trim(p_email)))] loop
   insert into public.purchase_access_attempts(bucket,window_start,attempts) values(bucket_key,now(),1)
   on conflict(bucket) do update set
     attempts=case when purchase_access_attempts.window_start<now()-interval '15 minutes' then 1 else purchase_access_attempts.attempts+1 end,
     window_start=case when purchase_access_attempts.window_start<now()-interval '15 minutes' then now() else purchase_access_attempts.window_start end
   returning attempts into tries;
   if tries>(case when bucket_key like 'ip:%' then 30 else 5 end) then return jsonb_build_object('error','rate_limited'); end if;
 end loop;
 select e.* into r from public.purchase_access_emails e join public.users u on u.id=e.user_id
 where e.email=lower(trim(p_email)) and lower(trim(u.email))=e.email and e.code_hash=p_code_hash
   and e.used_at is null and e.revoked_at is null and e.first_attempt_at is not null
 for update of e;
 if not found then return jsonb_build_object('error','invalid_code'); end if;
 update public.purchase_access_emails set used_at=now() where id=r.id;
 insert into public.purchase_password_grants(token_hash,user_id) values(p_grant_hash,r.user_id);
 return jsonb_build_object('userId',r.user_id);
end $$;

create function public.finish_purchase_password(p_user text,p_grant_hash text,p_password_hash text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare g public.purchase_password_grants%rowtype;
begin
 select * into g from public.purchase_password_grants where token_hash=p_grant_hash and user_id=p_user
   and used_at is null and expires_at>now() for update;
 if not found then return false; end if;
 if p_password_hash is not null then
   if p_password_hash !~ '^\$2[aby]\$12\$' then raise exception 'Invalid password hash'; end if;
   update public.users set password_hash=p_password_hash,updated_at=now() where id=p_user;
   if not found then return false; end if;
 end if;
 update public.purchase_password_grants set used_at=now() where token_hash=p_grant_hash;
 return true;
end $$;
revoke all on function public.enqueue_purchase_access_emails(),public.claim_purchase_access_emails(uuid,integer),public.consume_purchase_access_code(text,text,text,text),public.finish_purchase_password(text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_purchase_access_emails(),public.claim_purchase_access_emails(uuid,integer),public.consume_purchase_access_code(text,text,text,text),public.finish_purchase_password(text,text,text) to service_role;

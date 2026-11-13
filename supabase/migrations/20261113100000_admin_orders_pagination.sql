-- Read-only reporting helpers. No payment writes, triggers, event delivery or fulfillment changes.
create or replace function public.admin_decode_query(v text) returns text
language plpgsql immutable set search_path = '' as $$
declare result bytea := ''::bytea; i int := 1; s text := replace(v, '+', ' '); c text;
begin
 while i <= length(s) loop
  c := substr(s,i,1);
  if c = '%' and substr(s,i+1,2) ~ '^[0-9a-fA-F]{2}$' then
   result := result || decode(substr(s,i+1,2),'hex'); i := i+3;
  else result := result || convert_to(c,'UTF8'); i := i+1;
  end if;
 end loop;
 return convert_from(result,'UTF8');
exception when others then return v;
end $$;

create or replace function public.admin_order_channel(r jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare t jsonb := r; a jsonb := r->'attribution'; candidate jsonb; pair text; k text; v text;
 u text; src text; med text; path text; target text; alias text;
begin
 foreach candidate in array array[r->'last_touch',a->'lastTouch',a->'marketing',case when coalesce(a->>'utm_source',a->>'gclid',a->>'landing_path','') <> '' then a end] loop
  if jsonb_typeof(candidate)='object' and exists(select 1 from jsonb_each(candidate) e where e.value not in ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)) then t:=candidate; exit; end if;
 end loop;
 if t=r and coalesce(a->>'landing_path','')<>'' then t:= t || jsonb_build_object('landing_path',a->>'landing_path'); end if;
 u:=coalesce(nullif(t->>'url',''),nullif(t->>'landing_url',''),t->>'landing_path','');
 if strpos(u,'?')>0 then
  foreach pair in array string_to_array(split_part(split_part(u,'?',2),'#',1),'&') loop
   k:=public.admin_decode_query(split_part(pair,'=',1));
   v:=public.admin_decode_query(substr(pair,strpos(pair,'=')+1));
   if strpos(pair,'=')>0 and v<>'' and k in ('utm_source','utm_medium','utm_campaign','gclid','gbraid','wbraid','meta_campaign_id','meta_adset_id','meta_ad_id','campaign_id','fb_campaign_id','adset_id','fb_adset_id','ad_id','fb_ad_id') then t:=t || jsonb_build_object(k,v); end if;
  end loop;
 end if;
 foreach target in array array['campaign','adset','ad'] loop
  foreach alias in array array[target || '_id','fb_' || target || '_id'] loop
   if coalesce(t->>('meta_'||target||'_id'),'')='' and coalesce(t->>alias,'')<>'' then t:=t || jsonb_build_object('meta_'||target||'_id',t->>alias); end if;
  end loop;
 end loop;
 src:=lower(trim(coalesce(t->>'utm_source',''))); med:=lower(trim(coalesce(t->>'utm_medium','')));
 if src='codex_qa' or coalesce(a->>'trackingEnvironment','production')<>'production' or coalesce(r->'metadata'->>'trackingEnvironment','production')<>'production' then return 'test'; end if;
 if coalesce(nullif(trim(t->>'gclid'),''),nullif(trim(t->>'gbraid'),''),nullif(trim(t->>'wbraid'),''),'')<>'' then return 'google'; end if;
 if src in ('google','google_ads','googleads') and med ~ '^(cpc|ppc|paid|paidsearch|paid_search|paid_social|paid-social|paidsocial|paid social|cpm)$' then return 'google'; end if;
 if src<>'' and src not in ('meta','facebook','instagram','fb','ig','facebook.com','instagram.com','m.facebook.com','l.facebook.com','l.instagram.com') then return 'other'; end if;
 if med in ('organic','referral','social','email') then return 'other'; end if;
 if trim(t->>'meta_campaign_id') ~ '^[0-9]+$' or trim(t->>'meta_adset_id') ~ '^[0-9]+$' or trim(t->>'meta_ad_id') ~ '^[0-9]+$' then return 'meta'; end if;
 if src<>'' and med ~ '^(cpc|ppc|paid|paidsearch|paid_search|paid_social|paid-social|paidsocial|paid social|cpm)$' then return 'meta'; end if;
 if src<>'' or med<>'' then return 'other'; end if;
 u:=coalesce(nullif(t->>'landing_url',''),nullif(t->>'url',''),nullif(t->>'landing_path',''),nullif(t->>'path',''),t->>'route','');
 if u='' then return 'other'; end if;
 if u ~ '^https?://' then
  if lower(substring(u from '^https?://([^/:?#]+)')) not in ('astrorekha.com','www.astrorekha.com','localhost','127.0.0.1') then return 'other'; end if;
  u:=regexp_replace(u,'^https?://[^/]+','');
 elsif u ~ '^//' or u ~ '^[a-zA-Z]+:' then return 'other'; end if;
 path:='/' || ltrim(rtrim(split_part(split_part(u,'?',1),'#',1),'/'),'/');
 if path ~ '^/(discover|soulmate/discover|us/soulmate/discover)(/|$)' then return 'google'; end if;
 if path in ('/','/us','/soulmate','/us/soulmate') then return 'meta'; end if;
 return 'other';
end $$;

create index if not exists payments_admin_paid_created_id_idx on public.payments(created_at desc,id)
where payment_status in ('paid','success','captured');

-- Store only derived source labels, never duplicate payment amounts or customer details.
-- Refreshed on reads by fingerprint; no triggers or dependencies in payment processing.
create table if not exists public.admin_order_source_cache (
 payment_id text primary key,
 fingerprint text not null,
 ad_source text not null check (ad_source in ('meta','google','other','test')),
 refreshed_at timestamptz not null default now()
);
alter table public.admin_order_source_cache enable row level security;
revoke all on public.admin_order_source_cache from public,anon,authenticated;
grant select,insert,update,delete on public.admin_order_source_cache to service_role;

create or replace view public.admin_main_order_sources with (security_invoker = true) as
 select p.id, jsonb_build_object('last_touch',p.last_touch,'landing_url',p.landing_url,'landing_path',p.landing_path,
 'utm_source',p.utm_source,'utm_medium',p.utm_medium,'meta_campaign_id',p.meta_campaign_id,'meta_adset_id',p.meta_adset_id,'meta_ad_id',p.meta_ad_id) as touch
 from public.payments p where p.payment_status in ('paid','success','captured')
 and coalesce(p.id,'') !~ '^(pay_)?(sm_|us_sm_)' and coalesce(p.payu_txn_id,'') !~ '^(pay_)?(sm_|us_sm_)';
revoke all on public.admin_main_order_sources from public,anon,authenticated;
grant select on public.admin_main_order_sources to service_role;

create or replace function public.read_admin_main_orders(
 p_source text default 'all', p_start timestamptz default null, p_end timestamptz default null,
 p_type text default 'all', p_search text default '', p_page int default 1, p_size int default 50,
 p_names jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare result jsonb;
begin
 insert into public.admin_order_source_cache(payment_id,fingerprint,ad_source,refreshed_at)
 select s.id,md5(s.touch::text),public.admin_order_channel(s.touch),now()
 from public.admin_main_order_sources s left join public.admin_order_source_cache c on c.payment_id=s.id
 where c.fingerprint is distinct from md5(s.touch::text)
 on conflict(payment_id) do update set fingerprint=excluded.fingerprint,ad_source=excluded.ad_source,refreshed_at=excluded.refreshed_at;
 with candidates as materialized (
  select p.id,p.payu_txn_id,p.user_id,p.type,p.bundle_id,p.feature,p.coins,p.customer_email,p.amount,p.currency,p.created_at,
   coalesce(nullif(u.email,''),p.customer_email,'Unknown') as email, coalesce(u.name,'') as customer_name,
   coalesce(c.ad_source,public.admin_order_channel(s.touch)) as ad_source
  from public.payments p join public.admin_main_order_sources s on s.id=p.id
  left join public.admin_order_source_cache c on c.payment_id=p.id and c.fingerprint=md5(s.touch::text)
  left join public.users u on u.id=p.user_id
  where (p_start is null or p.created_at>=p_start) and (p_end is null or p.created_at<=p_end)
   and (p_type='all' or case when lower(trim(p.type))='bundle' then 'bundle_payment' else lower(trim(p.type)) end=p_type)
 ), filtered as materialized (
  select c.* from candidates c where (p_source='all' or c.ad_source=p_source)
   and (p_search='' or strpos(lower(concat_ws(' ',c.id,c.user_id,c.email,c.customer_name,c.type,c.bundle_id,c.feature,
    (select string_agg(coalesce(p_names->>trim(x),trim(x)),' ') from unnest(string_to_array(concat_ws(',',c.bundle_id,c.feature),',')) x))),lower(p_search))>0)
 ), paged as (
  select * from filtered order by created_at desc,id limit least(100,greatest(10,p_size)) offset (greatest(1,p_page)-1)*least(100,greatest(10,p_size))
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(paged) order by created_at desc,id) from paged),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.admin_decode_query(text), public.admin_order_channel(jsonb), public.read_admin_main_orders(text,timestamptz,timestamptz,text,text,int,int,jsonb) from public,anon,authenticated;
grant execute on function public.admin_decode_query(text), public.admin_order_channel(jsonb), public.read_admin_main_orders(text,timestamptz,timestamptz,text,text,int,int,jsonb) to service_role;

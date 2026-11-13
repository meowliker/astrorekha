-- Workspace membership is independent of paid-ad attribution. No payment rows change.
begin;
create or replace function public.admin_order_workspace(r jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare t jsonb := r; a jsonb := r->'attribution'; candidate jsonb;
 channel text := public.admin_order_channel(r); u text; path text;
begin
 if channel='test' then return 'test'; end if;
 if channel='google' then return 'google'; end if;
 foreach candidate in array array[r->'last_touch',a->'lastTouch',a->'marketing',case when coalesce(a->>'utm_source',a->>'gclid',a->>'landing_path','') <> '' then a end] loop
  if jsonb_typeof(candidate)='object' and exists(select 1 from jsonb_each(candidate) e where e.value not in ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)) then t:=candidate; exit; end if;
 end loop;
 if t=r and coalesce(a->>'landing_path','')<>'' then t:=t || jsonb_build_object('landing_path',a->>'landing_path'); end if;
 u:=coalesce(nullif(t->>'landing_url',''),nullif(t->>'url',''),nullif(t->>'landing_path',''),nullif(t->>'path',''),t->>'route','');
 if u ~ '^https?://' then
  if lower(substring(u from '^https?://([^/:?#]+)')) not in ('astrorekha.com','www.astrorekha.com','localhost','127.0.0.1') then return 'meta'; end if;
  u:=regexp_replace(u,'^https?://[^/]+','');
 elsif u ~ '^//' or u ~ '^[a-zA-Z]+:' then return 'meta'; end if;
 path:='/' || ltrim(rtrim(split_part(split_part(u,'?',1),'#',1),'/'),'/');
 if path ~ '^/(discover|soulmate/discover|us/soulmate/discover)(/|$)' then return 'google'; end if;
 return 'meta';
end $$;
revoke all on function public.admin_order_workspace(jsonb) from public,anon,authenticated;
grant execute on function public.admin_order_workspace(jsonb) to service_role;
alter table public.admin_order_source_cache add column if not exists workspace text check(workspace in ('meta','google','test'));

create or replace function public.read_admin_main_orders(
 p_source text default 'all', p_start timestamptz default null, p_end timestamptz default null,
 p_type text default 'all', p_search text default '', p_page int default 1, p_size int default 50,
 p_names jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare result jsonb;
begin
 insert into public.admin_order_source_cache(payment_id,fingerprint,ad_source,workspace,refreshed_at)
 select s.id,md5(s.touch::text),public.admin_order_channel(s.touch),public.admin_order_workspace(s.touch),now()
 from public.admin_main_order_sources s left join public.admin_order_source_cache c on c.payment_id=s.id
 where c.fingerprint is distinct from md5(s.touch::text) or c.workspace is null
 on conflict(payment_id) do update set fingerprint=excluded.fingerprint,ad_source=excluded.ad_source,workspace=excluded.workspace,refreshed_at=excluded.refreshed_at;
 with candidates as materialized (
  select p.id,p.payu_txn_id,p.user_id,p.type,p.bundle_id,p.feature,p.coins,p.customer_email,p.amount,p.currency,p.created_at,
   coalesce(nullif(u.email,''),p.customer_email,'Unknown') as email, coalesce(u.name,'') as customer_name,
   coalesce(c.ad_source,public.admin_order_channel(s.touch)) as ad_source,
   coalesce(c.workspace,public.admin_order_workspace(s.touch)) as workspace
  from public.payments p join public.admin_main_order_sources s on s.id=p.id
  left join public.admin_order_source_cache c on c.payment_id=p.id and c.fingerprint=md5(s.touch::text)
  left join public.users u on u.id=p.user_id
  where (p_start is null or p.created_at>=p_start) and (p_end is null or p.created_at<=p_end)
   and (p_type='all' or case when lower(trim(p.type))='bundle' then 'bundle_payment' else lower(trim(p.type)) end=p_type)
 ), filtered as materialized (
  select c.* from candidates c where (p_source='all' or c.workspace=p_source)
   and (p_search='' or strpos(lower(concat_ws(' ',c.id,c.user_id,c.email,c.customer_name,c.type,c.bundle_id,c.feature,
    (select string_agg(coalesce(p_names->>trim(x),trim(x)),' ') from unnest(string_to_array(concat_ws(',',c.bundle_id,c.feature),',')) x))),lower(p_search))>0)
 ), paged as (
  select * from filtered order by created_at desc,id limit least(100,greatest(10,p_size)) offset (greatest(1,p_page)-1)*least(100,greatest(10,p_size))
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(paged) order by created_at desc,id) from paged),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.admin_decode_query(text), public.admin_order_channel(jsonb), public.read_admin_main_orders(text,timestamptz,timestamptz,text,text,int,int,jsonb) from public,anon,authenticated;
grant execute on function public.admin_decode_query(text), public.admin_order_channel(jsonb), public.read_admin_main_orders(text,timestamptz,timestamptz,text,text,int,int,jsonb) to service_role;

-- Guard the production migration against source/workspace regressions.
do $$ begin
 if public.admin_order_workspace('{"last_touch":{"utm_source":"ig","utm_medium":"social","landing_path":"/"}}') <> 'meta' then raise exception 'Instagram workspace mismatch'; end if;
 if public.admin_order_workspace('{"last_touch":{"utm_source":"ig","utm_medium":"social","landing_path":"/discover"}}') <> 'google' then raise exception 'Google funnel mismatch'; end if;
 if public.admin_order_workspace('{"last_touch":{"utm_source":"facebook","utm_medium":"paid","landing_path":"/soulmate/discover"}}') <> 'google' then raise exception 'Google route mismatch'; end if;
 if public.admin_order_workspace('{"last_touch":{"utm_source":"codex_qa","landing_path":"/"}}') <> 'test' then raise exception 'Test workspace mismatch'; end if;
 if public.admin_order_workspace('{}') <> 'meta' then raise exception 'Direct workspace mismatch'; end if;
end $$;
commit;

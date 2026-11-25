-- Include verified Airpay and Fastrr purchases in the existing single invoice/access email queue.
CREATE OR REPLACE FUNCTION public.enqueue_purchase_access_emails()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
     and coalesce(to_jsonb(p)->>'gateway','payu') in ('payu','paytm','pinelabs','airpay','shiprocket')
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
end $function$
;

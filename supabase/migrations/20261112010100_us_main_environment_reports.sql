-- Keep local/preview test purchases out of the default production US totals.
drop function public.us_main_summary(timestamptz,timestamptz,text);
create function public.us_main_summary(p_from timestamptz,p_to timestamptz,p_mode text,p_environment text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'paidOrders',(select count(*) from us_main_orders where payment_mode=p_mode and payment_status='paid' and paid_at>=p_from and paid_at<p_to and attribution->>'trackingEnvironment'=p_environment),
  'grossCents',(select coalesce(sum(amount_cents),0) from us_main_orders where payment_mode=p_mode and payment_status='paid' and paid_at>=p_from and paid_at<p_to and attribution->>'trackingEnvironment'=p_environment),
  'visits',(select count(distinct session_id) from us_main_events where event_name='page_view' and path='/us' and created_at>=p_from and created_at<p_to and environment=p_environment)
 );
$$;
revoke all on function public.us_main_summary(timestamptz,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.us_main_summary(timestamptz,timestamptz,text,text) to service_role;

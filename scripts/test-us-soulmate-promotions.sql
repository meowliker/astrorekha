-- Run in a rollback transaction; never persist fixtures or send provider requests.
begin;
do $$
declare
  table_name text;
  order_id text := 'us_sm_00000000000000000001';
  seed uuid := gen_random_uuid();
  due timestamptz;
  original_functions text;
begin
  for table_name in select tablename from pg_tables where schemaname='public' and tablename like 'us_soulmate%' loop
    if not (select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass) then raise exception 'RLS missing: %',table_name; end if;
    if has_table_privilege('anon','public.'||table_name,'select') or has_table_privilege('authenticated','public.'||table_name,'select') then raise exception 'Public read: %',table_name; end if;
    if not has_table_privilege('service_role','public.'||table_name,'select,insert,update,delete') then raise exception 'Server access missing: %',table_name; end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%us_soulmate%' and has_function_privilege('anon',p.oid,'execute')) then raise exception 'US function publicly executable'; end if;
  if not exists(select 1 from storage.buckets where id='us-soulmate-sketches-private' and not public) then raise exception 'Private bucket missing'; end if;
  if not save_us_soulmate_session(seed,repeat('a',64),'{"name":"Fixture"}',1) then raise exception 'Session not saved'; end if;
  if save_us_soulmate_session(seed,repeat('b',64),'{"name":"Wrong token"}',2) then raise exception 'Session token not enforced'; end if;
  if exists(select 1 from soulmate_sessions where id=seed) then raise exception 'Session leaked to India'; end if;
  insert into us_soulmate_orders(id,checkout_key,checkout_fingerprint,plan,customer_name,customer_email,customer_phone,answers,
    base_amount,gst_amount,amount,delivery_hours,product_info,payment_mode,catalog_version,line_items,entitlements,session_id)
  values(order_id,gen_random_uuid(),'fixture','express','Fixture','fixture@example.com',null,
    '{"name":"Fixture","heart":"I feel like I’ve been waiting forever","preferenceSelection":"I like men","preference":"I like men","feeling":"Safe — someone who stays","birthDate":"1995-01-01","ethnicity":"White"}',
    2995,539,3534,12,'US fixture','test',2,'[{"id":"us_soulmate_express","name":"Complete Soulmate Vision","amount_paise":2995,"quantity":1}]',
    '{"sketch":"colour","description":true,"timeline":false,"delivery":"express","promised_hours":12,"scheduled_hours":12,"required_assets":["sketch","description"]}',seed);
  if (select currency from us_soulmate_orders where id=order_id)<>'USD' then raise exception 'Wrong currency'; end if;
  begin
    update us_soulmate_orders set amount=3180,gst_amount=484,discount_amount=299 where id=order_id;
    raise exception 'TEST_UNVERIFIED_DISCOUNT_ALLOWED';
  exception when raise_exception then if sqlerrm='TEST_UNVERIFIED_DISCOUNT_ALLOWED' then raise; end if; end;
  perform finalize_us_soulmate_promotion(order_id,'cs_test_fixture',299,484,3180,'FIXTURE','{"promotionId":"promo_fixture"}');
  perform finalize_us_soulmate_promotion(order_id,'cs_test_fixture',299,484,3180,'FIXTURE','{"promotionId":"promo_fixture"}');
  begin
    perform finalize_us_soulmate_promotion(order_id,'cs_other',300,484,3179,'FIXTURE','{}');
    raise exception 'TEST_PROMO_REWRITE_ALLOWED';
  exception when raise_exception then if sqlerrm='TEST_PROMO_REWRITE_ALLOWED' then raise; end if; end;
  update us_soulmate_orders set payment_status='paid',paid_at=now(),stripe_session_id='cs_test_fixture',stripe_payment_id='pi_test_fixture',fulfillment_status='queued' where id=order_id;
  if not exists(select 1 from us_soulmate_order_invoices where us_soulmate_order_invoices.order_id='us_sm_00000000000000000001'
     and (snapshot->>'discount')::integer=299 and (snapshot->>'total')::integer=3180 and (snapshot->>'gst')::integer=484) then raise exception 'Discounted invoice snapshot incorrect'; end if;
  begin
    perform finalize_us_soulmate_promotion(order_id,'cs_test_fixture',300,484,3179,'FIXTURE','{}');
    raise exception 'TEST_PAID_PROMO_CHANGE_ALLOWED';
  exception when raise_exception then if sqlerrm='TEST_PAID_PROMO_CHANGE_ALLOWED' then raise; end if; end;
  select scheduled_send_at into due from us_soulmate_orders where id=order_id;
  if due <> now()+interval '8 hours' then raise exception 'Incorrect backend schedule'; end if;
  if not exists(select 1 from us_soulmate_generation_jobs where us_soulmate_generation_jobs.order_id='us_sm_00000000000000000001') then raise exception 'Generation not queued'; end if;
  if not exists(select 1 from us_soulmate_email_deliveries where us_soulmate_email_deliveries.order_id='us_sm_00000000000000000001' and scheduled_at=due) then raise exception 'Delivery not queued'; end if;
  if not exists(select 1 from us_soulmate_order_invoices where us_soulmate_order_invoices.order_id='us_sm_00000000000000000001' and invoice_number like 'ARUS-%') then raise exception 'US invoice missing'; end if;
  if exists(select 1 from soulmate_orders where id=order_id) or exists(select 1 from soulmate_order_invoices where soulmate_order_invoices.order_id='us_sm_00000000000000000001') then raise exception 'Order leaked to India'; end if;
  begin
    update us_soulmate_orders set payment_status='failed' where id=order_id;
    raise exception 'TEST_DOWNGRADE_ALLOWED';
  exception when raise_exception then if sqlerrm='TEST_DOWNGRADE_ALLOWED' then raise; end if; end;
  begin
    update us_soulmate_orders set amount=1,base_amount=1 where id=order_id;
    raise exception 'TEST_PRICE_CHANGE_ALLOWED';
  exception when raise_exception then if sqlerrm='TEST_PRICE_CHANGE_ALLOWED' then raise; end if; end;
  if not exists(select 1 from claim_us_soulmate_report_jobs('test',2) where claim_us_soulmate_report_jobs.order_id='us_sm_00000000000000000001') then raise exception 'US report job not claimed'; end if;
end $$;
select 'US promo finalization, replay protection, invoice totals, permissions and isolation passed' as result;
rollback;

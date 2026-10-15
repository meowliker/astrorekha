-- Run inside a transaction and always roll back. No provider requests or emails.
do $$
declare
  session uuid := '11111111-1111-4111-8111-111111111111';
  oid text := 'sm_00000000000000000000';
  due timestamptz;
  claimed integer;
begin
  assert save_soulmate_session(session, 'fixture-token', '{"name":"Test"}', 1);
  assert save_soulmate_session(session, 'fixture-token', '{"name":"Test","heart":"Hope"}', 2);
  assert save_soulmate_session(session, 'fixture-token', '{"name":"Older"}', 1);
  assert not save_soulmate_session(session, 'wrong-token', '{"name":"Intruder"}', 3);
  assert (select answers->>'name' = 'Test' and revision = 2 from soulmate_sessions where id = session);
  assert not save_soulmate_session(session, 'fixture-token', '{"name":"Conflict"}', 2);
  insert into soulmate_orders(id,checkout_key,checkout_fingerprint,plan,customer_name,customer_email,customer_phone,answers,base_amount,gst_amount,amount,delivery_hours,product_info,payment_mode,session_id)
  values(oid,gen_random_uuid(),'fixture','standard','Test','test@example.invalid','919876543210','{"name":"Test"}',99900,17982,117882,8,'Fixture','test',session);
  assert not exists(select 1 from soulmate_generation_jobs where order_id = oid);
  update soulmate_orders set payment_status = 'paid', paid_at = now(), fulfillment_status = 'queued' where id = oid;
  assert (select scheduled_send_at = paid_at + interval '8 hours' from soulmate_orders where id = oid);
  select scheduled_at into due from soulmate_email_deliveries where order_id = oid;
  assert due is not null;
  update soulmate_orders set payment_status = 'paid' where id = oid;
  assert (select count(*) = 1 from soulmate_generation_jobs where order_id = oid);
  assert (select scheduled_at = due from soulmate_email_deliveries where order_id = oid);
  select count(*) into claimed from claim_soulmate_deliveries('test',3) where order_id = oid;
  assert claimed = 1;
  select count(*) into claimed from claim_soulmate_deliveries('test',3) where order_id = oid;
  assert claimed = 0;
  begin
    update soulmate_orders set answers = '{"name":"Wrong"}' where id = oid;
    raise exception 'Snapshot mutation was allowed';
  exception when others then
    if sqlerrm <> 'Soulmate order snapshot is immutable; create a new checkout' then raise; end if;
  end;
  begin
    update soulmate_orders set payment_status = 'failed' where id = oid;
    raise exception 'Paid downgrade was allowed';
  exception when others then
    if sqlerrm <> 'Paid soulmate order cannot be downgraded or rescheduled' then raise; end if;
  end;
  assert not has_table_privilege('anon','public.soulmate_sessions','select');
  assert not has_table_privilege('authenticated','public.soulmate_generation_jobs','select');
  assert not has_function_privilege('anon','public.claim_soulmate_deliveries(text,integer,integer)','execute');
  assert (select not public from storage.buckets where id = 'soulmate-sketches-private');
end $$;
select 'Soulmate database assertions passed; fixtures rolled back' as result;
rollback;

begin;
do $$
declare oid text := 'sm_11111111111111111111'; due timestamptz;
begin
  insert into soulmate_orders(id,checkout_key,checkout_fingerprint,plan,customer_name,customer_email,customer_phone,answers,base_amount,gst_amount,amount,delivery_hours,product_info,payment_mode,catalog_version,line_items,add_ons,entitlements)
  values(oid,gen_random_uuid(),'buyer-fixture','express','Fixture','buyer@example.invalid','919876543210','{}',189800,34164,223964,12,'Bundle fixture','test',2,'[{"id":"soulmate_express"},{"id":"timeline"}]','["timeline"]','{"sketch":"colour","description":true,"timeline":true,"delivery":"express","promised_hours":12,"scheduled_hours":12,"required_assets":["sketch","description","timeline"]}');
  update soulmate_orders set payment_status='paid',paid_at=now()-interval '13 hours',fulfillment_status='queued' where id=oid;
  assert (select scheduled_send_at=paid_at+interval '12 hours' from soulmate_orders where id=oid);
  select scheduled_at into due from soulmate_email_deliveries where order_id=oid;
  assert due is not null;
  assert not exists(select 1 from claim_soulmate_deliveries('test',3,2) where order_id=oid), 'Unapproved order was claimable';
  begin
    perform approve_soulmate_order(oid,'test');
    raise exception 'Incomplete bundle approved';
  exception when others then if sqlerrm<>'Upload every purchased deliverable before approval' then raise; end if; end;
  perform save_soulmate_order_asset(oid,'sketch',oid||'/sketch.png','sketch.png','image/png',100,repeat('a',64));
  perform save_soulmate_order_asset(oid,'description',oid||'/description.pdf','description.pdf','application/pdf',100,repeat('b',64));
  perform save_soulmate_order_asset(oid,'timeline',oid||'/timeline.pdf','timeline.pdf','application/pdf',100,repeat('c',64));
  perform approve_soulmate_order(oid,'Reviewed all three');
  assert (select review_status='approved' from soulmate_orders where id=oid);
  assert not exists(select 1 from claim_soulmate_deliveries('test',3) where order_id=oid), 'Old worker claimed new bundle';
  assert exists(select 1 from claim_soulmate_deliveries('test',3,2) where order_id=oid), 'Approved due bundle was not claimable';
  begin
    perform save_soulmate_order_asset(oid,'sketch',oid||'/replacement.png','sketch.png','image/png',100,repeat('d',64));
    raise exception 'Approved file replaced';
  exception when others then if sqlerrm<>'Order is not awaiting review' then raise; end if; end;
  begin
    update soulmate_orders set line_items='[]' where id=oid;
    raise exception 'Purchased items changed';
  exception when others then if sqlerrm<>'Soulmate order snapshot is immutable; create a new checkout' then raise; end if; end;
  begin
    update soulmate_orders set delivery_hours=48 where id=oid;
    raise exception 'Schedule changed';
  exception when others then if sqlerrm<>'Soulmate order snapshot is immutable; create a new checkout' then raise; end if; end;
  insert into soulmate_orders(id,checkout_key,checkout_fingerprint,plan,customer_name,customer_email,customer_phone,answers,base_amount,gst_amount,amount,delivery_hours,product_info,payment_mode,catalog_version,entitlements)
  values('sm_22222222222222222222',gen_random_uuid(),'normal-fixture','standard','Fixture','buyer@example.invalid','919876543210','{}',99900,17982,117882,48,'Normal fixture','test',2,'{"promised_hours":48,"scheduled_hours":48,"required_assets":["sketch"]}');
  update soulmate_orders set payment_status='paid',paid_at=now(),fulfillment_status='queued' where id='sm_22222222222222222222';
  assert (select scheduled_send_at=paid_at+interval '48 hours' from soulmate_orders where id='sm_22222222222222222222');
  assert not has_table_privilege('anon','public.soulmate_order_assets','select');
  assert not has_function_privilege('authenticated','public.approve_soulmate_order(text,text)','execute');
  assert not has_function_privilege('anon','public.claim_soulmate_deliveries(text,integer,integer)','execute');
  assert (select not public from storage.buckets where id='soulmate-sketches-private');
end $$;
select 'Buyer item, review, schedule, worker isolation and permissions assertions passed; rolling back fixtures' as result;
rollback;

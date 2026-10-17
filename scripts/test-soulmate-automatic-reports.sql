begin;
do $$
declare oid text := 'sm_fefefefefefefefefefe'; j soulmate_report_jobs; fresh soulmate_report_jobs; payload jsonb;
begin
  insert into soulmate_orders(id,checkout_key,checkout_fingerprint,plan,customer_name,customer_email,customer_phone,answers,base_amount,gst_amount,amount,delivery_hours,product_info,payment_mode,catalog_version,entitlements)
    values(oid,gen_random_uuid(),'automatic-report-fixture','standard','Fixture','fixture@example.invalid','919876543210','{}',99900,17982,117882,48,'Fixture','test',2,'{"sketch":"black_and_white","description":false,"timeline":false,"promised_hours":48,"scheduled_hours":48,"required_assets":["sketch"]}');
  assert not exists(select 1 from claim_soulmate_report_jobs('test',2) where order_id=oid), 'Unpaid order claimed';
  update soulmate_orders set payment_status='paid',paid_at=now()-interval '100 days',fulfillment_status='queued' where id=oid;
  select * into j from claim_soulmate_report_jobs('test',2) where order_id=oid;
  assert j.lease_id is not null, 'Paid pending order not claimed';
  assert not exists(select 1 from claim_soulmate_report_jobs('test',2) where order_id=oid), 'Live lease claimed twice';
  begin
    perform checkpoint_soulmate_reports(oid,1,gen_random_uuid(),'{}');
    raise exception 'Wrong lease accepted';
  exception when others then if sqlerrm<>'Preparation lease expired' then raise; end if; end;
  perform checkpoint_soulmate_reports(oid,1,j.lease_id,'{"stage":"sketch_submitting"}');
  perform revise_soulmate_order_answers(oid,'{"name":"Revised fixture"}');
  begin
    perform checkpoint_soulmate_reports(oid,1,j.lease_id,'{}');
    raise exception 'Stale revision accepted';
  exception when others then if sqlerrm<>'Preparation snapshot is no longer current' then raise; end if; end;
  select * into fresh from claim_soulmate_report_jobs('test',2) where order_id=oid;
  assert fresh.answer_revision=2 and fresh.state is null and fresh.lease_id<>j.lease_id;
  begin
    perform finish_soulmate_reports(oid,2,fresh.lease_id);
    raise exception 'Unchecked report approved';
  exception when others then if sqlerrm<>'Reports are not eligible for automatic approval' then raise; end if; end;
  payload := jsonb_build_object('stage','prepared','quality',jsonb_build_object('passed',true,'fingerprint',repeat('a',64)),
    'assets',jsonb_build_array(jsonb_build_object('kind','sketch','storagePath',oid||'/auto-r2/'||repeat('b',64)||'.pdf','filename','sketch.pdf','size',100,'sha256',repeat('b',64))));
  perform checkpoint_soulmate_reports(oid,2,fresh.lease_id,payload);
  perform finish_soulmate_reports(oid,2,fresh.lease_id);
  assert (select review_status='approved' and scheduled_send_at=paid_at+interval '48 hours' from soulmate_orders where id=oid);
  assert (select count(*)=1 from soulmate_order_assets where order_id=oid);
  assert not exists(select 1 from claim_soulmate_report_jobs('test',2) where order_id=oid), 'Approved order re-prepared';
  begin
    perform finish_soulmate_reports(oid,2,fresh.lease_id);
    raise exception 'Duplicate finalize accepted';
  exception when others then if sqlerrm<>'Reports are not eligible for automatic approval' then raise; end if; end;
  select lease_id into j.lease_id from claim_soulmate_deliveries('test',3,2) where order_id=oid;
  assert j.lease_id is not null;
  assert begin_soulmate_delivery(oid,2,j.lease_id), 'Due approved order cannot submit';
  assert not begin_soulmate_delivery(oid,2,j.lease_id), 'Duplicate email submission accepted';
  assert not exists(select 1 from claim_soulmate_report_jobs('test',2) where order_id=oid), 'Submitting delivery re-prepared';
  assert not has_table_privilege('anon','public.soulmate_report_jobs','select');
  assert not has_function_privilege('authenticated','public.claim_soulmate_report_jobs(text,integer)','execute');
end $$;
select 'Automatic queue, lease, revision, approval, schedule, send-once and permissions assertions passed; rolling back' as result;
rollback;

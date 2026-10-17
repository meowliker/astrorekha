begin;

do $$
declare oid text; hours integer; paid timestamptz:=now();
begin
  foreach hours in array array[12,48] loop
    oid:=case when hours=12 then 'sm_acacacacacacacacacac' else 'sm_bcbcbcbcbcbcbcbcbcbc' end;
    insert into soulmate_orders(id,checkout_key,checkout_fingerprint,plan,customer_name,customer_email,customer_phone,answers,base_amount,gst_amount,amount,delivery_hours,product_info,payment_mode,catalog_version,entitlements)
    values(oid,gen_random_uuid(),'schedule-fixture',case when hours=12 then 'express' else 'standard' end,'Fixture','fixture@example.invalid','919876543210','{}',99900,17982,117882,hours,'Fixture','test',2,jsonb_build_object('promised_hours',hours,'scheduled_hours',hours,'required_assets',jsonb_build_array('sketch')));
    update soulmate_orders set payment_status='paid',paid_at=paid,delivery_due_at=paid+make_interval(hours=>hours),fulfillment_status='queued' where id=oid;
    assert (select scheduled_send_at=paid+interval '8 hours' and delivery_hours=hours and (entitlements->>'promised_hours')::int=hours and delivery_due_at=paid+make_interval(hours=>hours) from soulmate_orders where id=oid),'Operational schedule changed the customer promise';
    assert (select scheduled_at=paid+interval '8 hours' from soulmate_email_deliveries where order_id=oid),'Email schedule not synced';
    begin
      update soulmate_orders set scheduled_send_at=now() where id=oid;
      raise exception 'Paid order schedule was mutable';
    exception when others then if sqlerrm<>'Paid soulmate order cannot be downgraded or rescheduled' then raise; end if; end;
    update soulmate_orders set payment_status='paid' where id=oid;
    assert (select count(*)=1 from soulmate_email_deliveries where order_id=oid),'Duplicate delivery created';
  end loop;
end $$;
select 'Eight-hour schedules, unchanged 12/48-hour promises, synchronized email schedules and immutable paid orders passed' as result;
rollback;

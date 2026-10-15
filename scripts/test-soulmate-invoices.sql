begin;
do $$
declare oid text:='sm_33333333333333333333'; iid uuid;
begin
insert into soulmate_orders(id,checkout_key,checkout_fingerprint,plan,customer_name,customer_email,customer_phone,answers,base_amount,gst_amount,amount,delivery_hours,product_info,payment_mode,catalog_version,line_items,entitlements)
values(oid,gen_random_uuid(),'invoice-fixture','express','Fixture','invoice@example.invalid','919876543210','{}',149900,26982,176882,12,'Invoice fixture','test',2,'[]','{"scheduled_hours":12,"promised_hours":12}');
assert ensure_soulmate_invoice(oid) is null, 'Unpaid order received invoice';
update soulmate_orders set payment_status='paid',paid_at=now() where id=oid;
select id into iid from soulmate_order_invoices where order_id=oid;
assert iid is not null,'Paid order did not queue invoice';
assert ensure_soulmate_invoice(oid)=iid,'Duplicate invoice';
assert (select count(*)=1 from soulmate_order_invoices where order_id=oid);
assert (select snapshot->>'customerEmail'='invoice@example.invalid' and (snapshot->>'total')::integer=176882 from soulmate_order_invoices where id=iid);
begin
 update soulmate_order_invoices set snapshot='{}' where id=iid;
 raise exception 'Invoice snapshot changed';
exception when others then if sqlerrm<>'Invoice snapshot is immutable' then raise; end if; end;
assert not has_table_privilege('anon','public.soulmate_order_invoices','select');
assert not has_function_privilege('authenticated','public.ensure_soulmate_invoice(text)','execute');
end $$;
select 'Paid-only invoice creation, unique numbering, immutable snapshot and private access passed; fixtures rolled back' as result;
rollback;

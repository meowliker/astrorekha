begin;

create or replace function public.soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.customer_name,new.customer_email,new.customer_phone,new.plan,new.amount,new.base_amount,new.gst_amount,new.session_id,new.payment_mode,new.checkout_fingerprint,new.catalog_version,new.line_items,new.add_ons,new.entitlements,new.product_info,new.delivery_hours)
     is distinct from row(old.customer_name,old.customer_email,old.customer_phone,old.plan,old.amount,old.base_amount,old.gst_amount,old.session_id,old.payment_mode,old.checkout_fingerprint,old.catalog_version,old.line_items,old.add_ons,old.entitlements,old.product_info,old.delivery_hours) then
    raise exception 'Soulmate order commercial snapshot is immutable';
  end if;
  if new.answers is distinct from old.answers then
    if new.answer_revision<>old.answer_revision+1 or not exists(
      select 1 from public.soulmate_order_answer_revisions r
      where r.order_id=old.id and r.revision=new.answer_revision
        and r.previous_answers=old.answers and r.revised_answers=new.answers
    ) then
      raise exception 'Soulmate answers require an audited revision';
    end if;
  elsif row(new.answer_revision,new.answers_updated_at) is distinct from row(old.answer_revision,old.answers_updated_at) then
    raise exception 'Soulmate answer revision metadata is immutable';
  end if;
  if old.payment_status='paid' and row(new.payment_status,new.paid_at,new.scheduled_send_at) is distinct from row(old.payment_status,old.paid_at,old.scheduled_send_at) then
    raise exception 'Paid soulmate order cannot be downgraded or rescheduled';
  end if;
  if new.payment_status='paid' and old.payment_status<>'paid' then
    if new.paid_at is null then raise exception 'Paid timestamp required'; end if;
    new.scheduled_send_at := new.paid_at + make_interval(hours => new.delivery_hours);
  end if;
  return new;
end $$;

commit;

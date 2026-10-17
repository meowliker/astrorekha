begin;
-- US-only: preserve the catalog snapshot and freeze Stripe's verified discount at session creation.
alter table public.us_soulmate_orders add column discount_amount integer not null default 0 check (discount_amount >= 0 and discount_amount <= base_amount);
alter table public.us_soulmate_orders add column promotion_code text;
alter table public.us_soulmate_orders add column promotion_snapshot jsonb;
alter table public.us_soulmate_orders drop constraint us_soulmate_orders_check;
alter table public.us_soulmate_orders add constraint us_soulmate_orders_amount_check check (amount = base_amount - discount_amount + gst_amount and amount >= 50);
create or replace function public.us_soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if old.stripe_session_id is not null and new.stripe_session_id is distinct from old.stripe_session_id then
    raise exception 'Stripe checkout reference is immutable';
  end if;
  if row(new.amount,new.gst_amount,new.discount_amount,new.promotion_code,new.promotion_snapshot)
     is distinct from row(old.amount,old.gst_amount,old.discount_amount,old.promotion_code,old.promotion_snapshot) then
    if old.payment_status<>'created' or new.payment_status<>'created' or old.stripe_session_id is not null
       or new.stripe_session_id is null or current_setting('app.us_soulmate_promotion_order',true) is distinct from old.id then
      raise exception 'US discount snapshot requires initial Stripe verification';
    end if;
  end if;
  if row(new.customer_name,new.customer_email,new.customer_phone,new.plan,new.base_amount,new.session_id,new.payment_mode,new.checkout_fingerprint,new.catalog_version,new.line_items,new.add_ons,new.entitlements,new.product_info,new.delivery_hours)
     is distinct from row(old.customer_name,old.customer_email,old.customer_phone,old.plan,old.base_amount,old.session_id,old.payment_mode,old.checkout_fingerprint,old.catalog_version,old.line_items,old.add_ons,old.entitlements,old.product_info,old.delivery_hours) then
    raise exception 'Soulmate order commercial snapshot is immutable';
  end if;
  if new.answers is distinct from old.answers then
    if new.answer_revision<>old.answer_revision+1 or not exists(
      select 1 from public.us_soulmate_order_answer_revisions r
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
    -- Backend send target is independent of the immutable 12/48-hour customer promise.
    new.scheduled_send_at := new.paid_at + make_interval(hours => case when new.catalog_version=2 then 8 else new.delivery_hours end);
  end if;
  return new;
end $$;
create function public.finalize_us_soulmate_promotion(p_order text,p_session text,p_discount integer,p_tax integer,p_total integer,p_code text,p_snapshot jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare o us_soulmate_orders;
begin
  select * into o from us_soulmate_orders where id=p_order for update;
  if o.id is null then raise exception 'US order missing'; end if;
  if o.stripe_session_id=p_session and row(o.discount_amount,o.gst_amount,o.amount,o.promotion_code,o.promotion_snapshot)
      is not distinct from row(p_discount,p_tax,p_total,p_code,p_snapshot) then return; end if;
  if p_session is null or p_discount is null or p_tax is null or p_total is null or p_code is null or o.payment_status<>'created' or o.stripe_session_id is not null or p_session not like 'cs_%'
     or p_discount<=0 or p_discount>o.base_amount or p_tax<0 or p_tax>o.gst_amount
     or p_total<>o.base_amount-p_discount+p_tax or p_total<50 or length(p_code) not between 1 and 200
     or p_snapshot is null then raise exception 'Invalid initial US promotion'; end if;
  perform set_config('app.us_soulmate_promotion_order',p_order,true);
  update us_soulmate_orders set stripe_session_id=p_session,discount_amount=p_discount,gst_amount=p_tax,amount=p_total,
    promotion_code=p_code,promotion_snapshot=p_snapshot,updated_at=now() where id=p_order;
end $$;
revoke all on function public.finalize_us_soulmate_promotion(text,text,integer,integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_us_soulmate_promotion(text,text,integer,integer,integer,text,jsonb) to service_role;
create or replace function public.ensure_us_soulmate_invoice(p_order text) returns uuid language plpgsql set search_path=public as $$
declare o us_soulmate_orders; invoice_id uuid;
begin
  select * into o from us_soulmate_orders where id=p_order;
  if o.id is null or o.payment_status<>'paid' or o.catalog_version<>2 then return null; end if;
  insert into us_soulmate_order_invoices(order_id,source,snapshot)
  values(o.id,'purchase',jsonb_build_object('customerName',o.customer_name,'customerEmail',o.customer_email,'orderId',o.id,'items',o.line_items,'entitlements',o.entitlements,'subtotal',o.base_amount,'discount',o.discount_amount,'promotionCode',o.promotion_code,'gst',o.gst_amount,'total',o.amount,'paidAt',o.paid_at,'deliveryDueAt',o.delivery_due_at))
  on conflict(order_id) do nothing;
  select id into invoice_id from us_soulmate_order_invoices where order_id=o.id;
  return invoice_id;
end $$;
commit;

begin;

alter table public.soulmate_orders
  add column answer_revision integer not null default 1 check (answer_revision > 0),
  add column answers_updated_at timestamptz;

create table public.soulmate_order_answer_revisions (
  id bigint generated always as identity primary key,
  order_id text not null references public.soulmate_orders(id),
  revision integer not null check (revision > 0),
  previous_answers jsonb not null,
  revised_answers jsonb not null,
  revised_at timestamptz not null default now(),
  unique(order_id, revision)
);
alter table public.soulmate_order_answer_revisions enable row level security;
revoke all on public.soulmate_order_answer_revisions from anon, authenticated;
grant all on public.soulmate_order_answer_revisions to service_role;

-- Keep commercial and customer identity fields immutable. Answers are revised only
-- through revise_soulmate_order_answers(), which records an audit snapshot and resets fulfilment.
create or replace function public.soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.customer_name,new.customer_email,new.customer_phone,new.plan,new.amount,new.base_amount,new.gst_amount,new.session_id,new.payment_mode,new.checkout_fingerprint,new.catalog_version,new.line_items,new.add_ons,new.entitlements,new.product_info,new.delivery_hours)
     is distinct from row(old.customer_name,old.customer_email,old.customer_phone,old.plan,old.amount,old.base_amount,old.gst_amount,old.session_id,old.payment_mode,old.checkout_fingerprint,old.catalog_version,old.line_items,old.add_ons,old.entitlements,old.product_info,old.delivery_hours) then
    raise exception 'Soulmate order commercial snapshot is immutable';
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

create or replace function public.revise_soulmate_order_answers(p_order text, p_answers jsonb)
returns text[] language plpgsql set search_path=public as $$
declare
  o public.soulmate_orders;
  delivery_status text;
  old_paths text[];
  new_revision integer;
begin
  select * into o from public.soulmate_orders where id=p_order for update;
  if o.id is null or o.payment_status<>'paid' then raise exception 'Order is not paid'; end if;
  if o.fulfillment_status='delivered' or o.delivered_at is not null then raise exception 'Delivered orders cannot be revised'; end if;
  select status into delivery_status from public.soulmate_email_deliveries where order_id=p_order for update;
  if delivery_status in ('submitting','scheduled','sent','delivered') then raise exception 'Delivery has already been submitted'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'Invalid answers'; end if;
  if p_answers=o.answers then return array[]::text[]; end if;

  new_revision := o.answer_revision + 1;
  insert into public.soulmate_order_answer_revisions(order_id,revision,previous_answers,revised_answers)
    values(p_order,new_revision,o.answers,p_answers);

  select coalesce(array_agg(path),array[]::text[]) into old_paths from (
    select storage_path as path from public.soulmate_order_assets where order_id=p_order
    union
    select storage_path as path from public.soulmate_generation_jobs where order_id=p_order and storage_path is not null
  ) paths;

  delete from public.soulmate_order_assets where order_id=p_order;
  update public.soulmate_orders set
    answers=p_answers,
    answer_revision=new_revision,
    answers_updated_at=now(),
    review_status='pending',
    reviewed_at=null,
    review_note=null,
    updated_at=now()
  where id=p_order;
  update public.soulmate_generation_jobs set
    status='queued',
    prompt=null,
    provider_job_id=null,
    generation_attempts=0,
    failures=0,
    storage_path=null,
    image_sha256=null,
    lease_id=null,
    lease_until=null,
    next_attempt_at=now(),
    last_error=null,
    updated_at=now()
  where order_id=p_order;
  update public.soulmate_email_deliveries set
    status='pending',
    provider_message_id=null,
    submitted_at=null,
    sent_at=null,
    delivered_at=null,
    last_error=null,
    updated_at=now()
  where order_id=p_order;
  return old_paths;
end $$;

revoke all on function public.revise_soulmate_order_answers(text,jsonb) from public,anon,authenticated;
grant execute on function public.revise_soulmate_order_answers(text,jsonb) to service_role;

commit;

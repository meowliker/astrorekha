begin;

alter table public.soulmate_generation_jobs
  add column answer_revision integer not null default 1 check(answer_revision > 0);
update public.soulmate_generation_jobs j set answer_revision=o.answer_revision
  from public.soulmate_orders o where o.id=j.order_id;

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
    answer_revision=new_revision,
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

-- Serialize sending with answer edits. After this checkpoint an edit is rejected;
-- if the edit wins first, the stale worker cannot submit its attachments.
create function public.begin_soulmate_delivery(p_order text, p_revision integer, p_lease uuid)
returns boolean language plpgsql set search_path=public as $$
declare o public.soulmate_orders;
begin
  select * into o from public.soulmate_orders where id=p_order for update;
  if o.id is null or o.payment_status<>'paid' or o.answer_revision<>p_revision then return false; end if;
  if o.catalog_version=2 and (o.review_status<>'approved' or o.scheduled_send_at>now()) then return false; end if;
  if not exists(select 1 from public.soulmate_generation_jobs where order_id=p_order and lease_id=p_lease and answer_revision=p_revision and lease_until>now()) then return false; end if;
  update public.soulmate_email_deliveries set status='submitting',submitted_at=now(),updated_at=now()
    where order_id=p_order and status='pending';
  return found;
end $$;
revoke all on function public.begin_soulmate_delivery(text,integer,uuid) from public,anon,authenticated;
grant execute on function public.begin_soulmate_delivery(text,integer,uuid) to service_role;

commit;

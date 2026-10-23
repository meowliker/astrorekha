begin;
create table public.soulmate_whatsapp_deliveries (
  order_id text not null references public.soulmate_orders(id),
  kind text not null check (kind in ('invoice','sketch','description','timeline')),
  answer_revision integer not null,
  status text not null check (status in ('submitting','accepted','needs_review')),
  attempt_token uuid,
  submitted_at timestamptz,
  accepted_at timestamptz,
  provider_message_id text,
  last_error text,
  primary key (order_id,kind)
);
alter table public.soulmate_whatsapp_deliveries enable row level security;
revoke all on public.soulmate_whatsapp_deliveries from public,anon,authenticated;
grant all on public.soulmate_whatsapp_deliveries to service_role;

-- Lock the order while checking revision, payment, approval and predecessors.
-- An interrupted submission is never automatically reclaimed: AiSensy has no
-- documented idempotency key for campaign sends.
create function public.claim_soulmate_whatsapp_message(p_order text,p_kind text,p_revision integer,p_token uuid)
returns text language plpgsql set search_path=public as $$
declare o soulmate_orders; existing soulmate_whatsapp_deliveries; prior text;
begin
  select * into o from soulmate_orders where id=p_order for update;
  if o.id is null or o.funnel is distinct from 'soulmate_standalone' or o.catalog_version is distinct from 2 or
     o.payment_status is distinct from 'paid' or o.review_status is distinct from 'approved' or
     o.answer_revision is distinct from p_revision or p_token is null or p_kind is null or o.scheduled_send_at is null or o.scheduled_send_at>now()
     then return 'blocked'; end if;
  if p_kind not in ('invoice','sketch','description','timeline') or
     (p_kind<>'invoice' and not coalesce((o.entitlements->'required_assets') ? p_kind,false))
     then return 'blocked'; end if;
  select * into existing from soulmate_whatsapp_deliveries where order_id=p_order and kind=p_kind;
  if found then
    if existing.status='accepted' and existing.answer_revision=p_revision then return 'accepted'; end if;
    return 'blocked';
  end if;
  for prior in select k from unnest(array['invoice','sketch','description','timeline']) with ordinality as t(k,n)
    where n < array_position(array['invoice','sketch','description','timeline'],p_kind)
      and (k='invoice' or (o.entitlements->'required_assets') ? k)
  loop
    if not exists(select 1 from soulmate_whatsapp_deliveries where order_id=p_order and kind=prior
      and status='accepted' and answer_revision=p_revision) then return 'blocked'; end if;
  end loop;
  insert into soulmate_whatsapp_deliveries(order_id,kind,answer_revision,status,attempt_token,submitted_at)
    values(p_order,p_kind,p_revision,'submitting',p_token,now());
  return 'claimed';
end $$;

create function public.due_soulmate_whatsapp_orders(p_start timestamptz)
returns table(id text,answer_revision integer) language sql stable set search_path=public as $$
  select o.id,o.answer_revision from soulmate_orders o
  where o.funnel='soulmate_standalone' and o.catalog_version=2 and o.payment_status='paid'
    and o.payment_mode='live' and o.attribution->>'trackingEnvironment'='production'
    and o.review_status='approved' and o.paid_at>=p_start and o.scheduled_send_at<=now()
    and not exists(select 1 from soulmate_whatsapp_deliveries d where d.order_id=o.id and d.status<>'accepted')
    and exists(select 1 from jsonb_array_elements_text(jsonb_build_array('invoice') || (o.entitlements->'required_assets')) as a(k)
      where not exists(select 1 from soulmate_whatsapp_deliveries d where d.order_id=o.id and d.kind=k and d.status='accepted'))
  order by o.scheduled_send_at limit 1;
$$;
revoke all on function public.claim_soulmate_whatsapp_message(text,text,integer,uuid), public.due_soulmate_whatsapp_orders(timestamptz) from public,anon,authenticated;
grant execute on function public.claim_soulmate_whatsapp_message(text,text,integer,uuid), public.due_soulmate_whatsapp_orders(timestamptz) to service_role;

create function public.guard_soulmate_whatsapp_revision() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.answers,new.answer_revision) is distinct from row(old.answers,old.answer_revision)
     and exists(select 1 from soulmate_whatsapp_deliveries where order_id=old.id and submitted_at is not null)
     then raise exception 'WhatsApp delivery has already started'; end if;
  return new;
end $$;
create trigger soulmate_whatsapp_revision_guard before update on public.soulmate_orders
  for each row execute function public.guard_soulmate_whatsapp_revision();
revoke all on function public.guard_soulmate_whatsapp_revision() from public,anon,authenticated;
commit;

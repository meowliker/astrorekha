begin;
create or replace function public.claim_soulmate_whatsapp_message(p_order text,p_kind text,p_revision integer,p_token uuid)
returns text language plpgsql set search_path=public as $$
declare o soulmate_orders; existing soulmate_whatsapp_deliveries; prior text;
begin
  select * into o from soulmate_orders where id=p_order for update;
  if o.id is null or o.funnel is distinct from 'soulmate_standalone' or o.catalog_version is distinct from 2 or
     o.payment_status is distinct from 'paid' or o.answer_revision is distinct from p_revision or p_token is null or p_kind is null or
     (p_kind<>'invoice' and (o.review_status is distinct from 'approved' or o.scheduled_send_at is null or o.scheduled_send_at>now()))
     then return 'blocked'; end if;
  if p_kind not in ('invoice','sketch','description','timeline') or
     (p_kind<>'invoice' and not coalesce((o.entitlements->'required_assets') ? p_kind,false))
     then return 'blocked'; end if;
  select * into existing from soulmate_whatsapp_deliveries where order_id=p_order and kind=p_kind;
  if found then
    if existing.status='accepted' and (p_kind='invoice' or existing.answer_revision=p_revision) then return 'accepted'; end if;
    return 'blocked';
  end if;
  for prior in select k from unnest(array['invoice','sketch','description','timeline']) with ordinality as t(k,n)
    where n < array_position(array['invoice','sketch','description','timeline'],p_kind)
      and (k='invoice' or (o.entitlements->'required_assets') ? k)
  loop
    if not exists(select 1 from soulmate_whatsapp_deliveries where order_id=p_order and kind=prior
      and status='accepted' and (prior='invoice' or answer_revision=p_revision)) then return 'blocked'; end if;
  end loop;
  insert into soulmate_whatsapp_deliveries(order_id,kind,answer_revision,status,attempt_token,submitted_at)
    values(p_order,p_kind,p_revision,'submitting',p_token,now());
  return 'claimed';
end $$;


-- The invoice is sent immediately; reports still require approval and their saved delivery time.
-- Wait for the saved invoice PDF before selecting a job, so PDF preparation isn't a send failure.
create function public.due_soulmate_whatsapp_jobs(p_start timestamptz)
returns table(id text,answer_revision integer,phase text) language sql stable set search_path=public as $$
  select o.id,o.answer_revision,
    case when not exists(select 1 from soulmate_whatsapp_deliveries d where d.order_id=o.id and d.kind='invoice' and d.status='accepted')
      then 'invoice' else 'reports' end
  from soulmate_orders o
  where o.funnel='soulmate_standalone' and o.catalog_version=2 and o.payment_status='paid'
    and o.payment_mode='live' and o.attribution->>'trackingEnvironment'='production' and o.paid_at>=p_start
    and exists(select 1 from soulmate_order_invoices i where i.order_id=o.id and i.source='purchase' and i.storage_path is not null)
    and not exists(select 1 from soulmate_whatsapp_deliveries d where d.order_id=o.id and d.status<>'accepted')
    and (
      not exists(select 1 from soulmate_whatsapp_deliveries d where d.order_id=o.id and d.kind='invoice')
      or (o.review_status='approved' and o.scheduled_send_at<=now()
        and exists(select 1 from jsonb_array_elements_text(o.entitlements->'required_assets') as a(k)
          where not exists(select 1 from soulmate_whatsapp_deliveries d where d.order_id=o.id and d.kind=k and d.status='accepted')))
    )
  order by o.paid_at limit 1;
$$;
revoke all on function public.due_soulmate_whatsapp_jobs(timestamptz) from public,anon,authenticated;
grant execute on function public.due_soulmate_whatsapp_jobs(timestamptz) to service_role;

-- An invoice doesn't depend on answers. Only report submission locks a revision.
create or replace function public.guard_soulmate_whatsapp_revision() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.answers,new.answer_revision) is distinct from row(old.answers,old.answer_revision)
     and exists(select 1 from soulmate_whatsapp_deliveries where order_id=old.id and kind<>'invoice' and submitted_at is not null)
     then raise exception 'WhatsApp report delivery has already started'; end if;
  return new;
end $$;

commit;

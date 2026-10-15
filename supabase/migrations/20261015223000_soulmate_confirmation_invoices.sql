begin;
create sequence public.soulmate_invoice_number_seq;
create table public.soulmate_order_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id text unique references public.soulmate_orders(id),
  source text not null check(source in ('purchase','manual_preview')),
  invoice_number text not null unique default ('ARS-' || to_char(now() at time zone 'Asia/Kolkata','YY') || '-' || lpad(nextval('public.soulmate_invoice_number_seq')::text,7,'0')),
  issued_at timestamptz not null default now(),
  snapshot jsonb not null,
  storage_path text unique,
  pdf_sha256 text,
  status text not null default 'pending' check(status in ('pending','preparing','submitting','sent','needs_review')),
  lease_until timestamptz,
  processing_token uuid,
  submitted_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  check((source='purchase' and order_id is not null) or (source='manual_preview' and order_id is null))
);
alter table public.soulmate_order_invoices enable row level security;
revoke all on public.soulmate_order_invoices, public.soulmate_invoice_number_seq from anon,authenticated;
grant all on public.soulmate_order_invoices, public.soulmate_invoice_number_seq to service_role;
create index soulmate_invoice_queue on public.soulmate_order_invoices(issued_at) where source='purchase' and status in ('pending','preparing');

create function public.ensure_soulmate_invoice(p_order text) returns uuid language plpgsql set search_path=public as $$
declare o soulmate_orders; invoice_id uuid;
begin
  select * into o from soulmate_orders where id=p_order;
  if o.id is null or o.payment_status<>'paid' or o.catalog_version<>2 then return null; end if;
  insert into soulmate_order_invoices(order_id,source,snapshot)
  values(o.id,'purchase',jsonb_build_object('customerName',o.customer_name,'customerEmail',o.customer_email,'orderId',o.id,'items',o.line_items,'entitlements',o.entitlements,'subtotal',o.base_amount,'gst',o.gst_amount,'total',o.amount,'paidAt',o.paid_at,'deliveryDueAt',o.delivery_due_at))
  on conflict(order_id) do nothing;
  select id into invoice_id from soulmate_order_invoices where order_id=o.id;
  return invoice_id;
end $$;
create function public.soulmate_invoice_after_payment() returns trigger language plpgsql set search_path=public as $$
begin
  if new.payment_status='paid' and old.payment_status<>'paid' and new.catalog_version=2 then perform ensure_soulmate_invoice(new.id); end if;
  return new;
end $$;
create trigger soulmate_invoice_on_payment after update of payment_status on public.soulmate_orders for each row execute function public.soulmate_invoice_after_payment();
create function public.soulmate_invoice_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.id,new.order_id,new.source,new.invoice_number,new.issued_at,new.snapshot) is distinct from row(old.id,old.order_id,old.source,old.invoice_number,old.issued_at,old.snapshot) then raise exception 'Invoice snapshot is immutable'; end if;
  if old.storage_path is not null and row(new.storage_path,new.pdf_sha256) is distinct from row(old.storage_path,old.pdf_sha256) then raise exception 'Saved invoice PDF is immutable'; end if;
  return new;
end $$;
create trigger soulmate_invoice_guard before update on public.soulmate_order_invoices for each row execute function public.soulmate_invoice_snapshot_guard();
revoke all on function public.ensure_soulmate_invoice(text),public.soulmate_invoice_after_payment(),public.soulmate_invoice_snapshot_guard() from public,anon,authenticated;
grant execute on function public.ensure_soulmate_invoice(text) to service_role;
commit;

begin;
-- Keep customer-facing deadlines aligned with the existing eight-hour email schedule.
alter table public.soulmate_orders drop constraint soulmate_orders_delivery_hours_check;
update public.soulmate_orders set delivery_hours = 8,
  delivery_due_at = case when paid_at is not null then paid_at + interval '8 hours' else null end;
alter table public.soulmate_orders add constraint soulmate_orders_delivery_hours_check check (delivery_hours = 8);
alter table public.soulmate_orders alter column delivery_hours set default 8;
commit;

-- Run after prepending the delegation migration without COMMIT. Rollback-only fixtures.
do $$
declare fixture uuid;
begin
 insert into public.support_staff(email,name,role) values('delegation-fixture@example.invalid','Delegation fixture','owner') returning id into fixture;
 if (select api_owner_access from public.support_staff where id=fixture) then raise exception 'Default permissions escalated'; end if;
 update public.support_staff set api_owner_access=true where id=fixture;
 if not (select api_owner_access from public.support_staff where id=fixture) then raise exception 'Owner delegation failed'; end if;
 begin
  update public.support_staff set role='support' where id=fixture;
  raise exception 'Invalid role delegation accepted';
 exception when check_violation then null;
 end;
 update public.support_staff set api_owner_access=false where id=fixture;
 update public.support_staff set role='support' where id=fixture;
 begin
  update public.support_staff set api_owner_access=true where id=fixture;
  raise exception 'Ordinary support escalation accepted';
 exception when check_violation then null;
 end;
end $$;
rollback;

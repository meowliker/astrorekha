-- Run after prepending the uncommitted live-rules migration; all changes roll back.
do $$
declare owner_id uuid; staff_id uuid; settings jsonb; original text; saved jsonb;
begin
 select v.settings,content into settings,original from support_rule_versions v where version=1;
 insert into support_staff(email,name,role) values('rules-owner-test@example.invalid','Rules owner test','owner') returning id into owner_id;
 insert into support_staff(email,name,role) values('rules-staff-test@example.invalid','Rules staff test','support') returning id into staff_id;
 begin perform support_publish_rules(staff_id,1,original,settings,'Unauthorized publish');raise exception 'Staff publish succeeded';exception when insufficient_privilege then null;end;
 saved=support_publish_rules(owner_id,1,original||E'\nUpdated instruction.',settings,'Regression update');
 if (saved->>'version')::int<>2 then raise exception 'Expected version 2';end if;
 if not exists(select 1 from support_audit where actor_id=owner_id and event='support_rules_published' and target='2') then raise exception 'Publish audit missing';end if;
 begin perform support_publish_rules(owner_id,1,original,settings,'Stale editor');raise exception 'Stale publish succeeded';exception when serialization_failure then null;end;
 begin update support_rule_versions set content=original where version=2;raise exception 'History changed';exception when others then if SQLERRM not like '%immutable%' then raise;end if;end;
 saved=support_publish_rules(owner_id,2,original,settings,'Restore version 1');
 if (saved->>'version')::int<>3 or saved->>'content'<>original then raise exception 'Version restore failed';end if;
 if (select count(*) from support_rule_versions)<>3 then raise exception 'History lost';end if;
 if has_table_privilege('anon','public.support_rule_versions','select') or has_function_privilege('authenticated','public.support_publish_rules(uuid,bigint,text,jsonb,text)','execute') then raise exception 'Public access allowed';end if;
end $$;
rollback;
select 'PASS: owner-only publish, conflict detection, immutable history, restore as new version, audit and private access; rolled back' as result;

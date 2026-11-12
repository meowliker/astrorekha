-- Run only after prepending the migration without COMMIT. Always ROLLBACK.
do $$
declare owner_id uuid; staff_id uuid; action_id uuid; action_two uuid; customer public.users%rowtype; r jsonb; before_coins integer; other_email text;
begin
 select * into customer from public.users where id='ec553e74-80a2-4be6-aa8d-d02537dfc0fe' for update;
 if not found or customer.email<>'astrorekha@gmail.com' then raise exception 'Expected dedicated test account not found'; end if;
 before_coins=customer.coins;
 insert into public.support_staff(email,name,role) values('support-owner-test@example.invalid','Test owner','owner') returning id into owner_id;
 insert into public.support_staff(email,name,role) values('support-staff-test@example.invalid','Test staff','support') returning id into staff_id;
 insert into public.support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,customer.id,'add_questions','{"questions":10}','Rollback-only authorization test','running') returning id into action_id;
 begin perform public.support_apply(action_id); raise exception 'SECURITY TEST FAILED: unapproved credit grant';
 exception when others then if SQLERRM not like '%Owner approval required%' then raise; end if; end;
 update public.support_actions set approved_by=staff_id where id=action_id;
 begin perform public.support_apply(action_id); raise exception 'SECURITY TEST FAILED: staff approval accepted';
 exception when others then if SQLERRM not like '%Owner approval required%' then raise; end if; end;
 update public.support_actions set approved_by=owner_id where id=action_id;
 r=public.support_apply(action_id);
 if (r->>'coins')::int<>before_coins+30 then raise exception 'Coin conversion failed'; end if;
 perform public.support_apply(action_id);
 if (select coins from users where id=customer.id)<>before_coins+30 then raise exception 'Idempotency failed'; end if;
 insert into payments(id,user_id,type,bundle_id,amount,currency,payment_status,customer_email,payu_txn_id)
 values('support-rollback-payment',customer.id,'bundle','palm-reading',65962,'INR','pending',customer.email,'support-rollback-txn');
 insert into support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,customer.id,'reconcile_payment','{"paymentId":"support-rollback-payment","verifiedAmount":65962,"transactionId":"support-rollback-gateway-id","features":["palmReading"],"coins":15}','Rollback-only payment replay test','running') returning id into action_id;
 perform public.support_apply(action_id);
 perform public.support_apply(action_id);
 if (select coins from users where id=customer.id)<>before_coins+45 then raise exception 'Payment replay duplicated coins'; end if;
 insert into support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,customer.id,'reconcile_payment','{"paymentId":"support-rollback-payment","verifiedAmount":65962,"transactionId":"support-rollback-gateway-id","features":["palmReading"],"coins":15}','Second action same payment','running') returning id into action_id;
 perform public.support_apply(action_id);
 if (select coins from users where id=customer.id)<>before_coins+45 then raise exception 'Different action duplicated payment coins'; end if;
 insert into public.support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,customer.id,'correct_birth',jsonb_build_object('fields',jsonb_build_object('birth_month','6','birth_day','28','birth_year','2003','birth_hour','12','birth_minute','30','birth_period','PM','birth_place','Raipur, Chhattisgarh, India','sun_sign','Gemini','moon_sign','Taurus','ascendant_sign','Virgo')),'Rollback-only birth consistency test','running') returning id into action_id;
 perform public.support_apply(action_id);
 if exists(select 1 from birth_chart_reports where user_id=customer.id and status='complete') then raise exception 'Old birth reports still ready'; end if;
 if (select sun_sign->>'name' from user_profiles where id=customer.id)<>'Gemini' then raise exception 'Profile sign not saved'; end if;
 insert into public.support_actions(request_key,actor_id,customer_id,kind,payload,reason,status,approved_by)
 values(gen_random_uuid(),staff_id,customer.id,'change_email','{"email":"support-email-test@example.invalid"}','Rollback-only email test','running',owner_id) returning id into action_id;
 perform public.support_apply(action_id);
 if (select email from users where id=customer.id)<>'support-email-test@example.invalid' or (select email from user_profiles where id=customer.id)<>'support-email-test@example.invalid' then raise exception 'Email not updated consistently'; end if;
 insert into public.support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,customer.id,'recover_report','{}','Concurrency test','running') returning id into action_id;
 begin
 insert into public.support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,customer.id,'recover_report','{}','Concurrency test 2','running');
 raise exception 'SECURITY TEST FAILED: concurrent repair allowed';
 exception when unique_violation then null; end;
 update public.support_actions set status='needs_review' where id=action_id;
 if has_function_privilege('anon','public.support_apply(uuid)','execute') or has_function_privilege('authenticated','public.support_apply(uuid)','execute') then raise exception 'Public RPC execution allowed'; end if;
 if has_table_privilege('anon','public.support_staff','select') or has_table_privilege('authenticated','public.support_sessions','select') then raise exception 'Public credentials readable'; end if;
 begin update public.support_audit set event='tampered';raise exception 'SECURITY TEST FAILED: audit writable';
 exception when others then if SQLERRM not like '%immutable%' then raise; end if; end;
 if not public.support_rate_limit('rollback-limit-test',1,60) or public.support_rate_limit('rollback-limit-test',1,60) then raise exception 'Rate limit failed'; end if;
end $$;
rollback;
select 'PASS: owner approval, credit replay protection, birth invalidation, email consistency, concurrent repair guard, public access denial, immutable audit, rate limits; all writes rolled back' as result;

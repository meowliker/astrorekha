-- Complimentary access is kept outside payment/revenue and advertising ledgers.
create table public.inr_free_coupons (
  id text primary key, code_hash text not null unique,
  enabled boolean not null default true, created_at timestamptz not null default now()
);
create table public.inr_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id text not null references public.inr_free_coupons(id),
  user_id text not null references public.users(id),
  product_type text not null check(product_type in ('bundle','report','upsell')),
  product_id text not null, product_name text not null,
  original_amount_paise bigint not null check(original_amount_paise > 0),
  amount_paise bigint not null default 0 check(amount_paise = 0),
  currency text not null default 'INR' check(currency = 'INR'),
  features jsonb not null, coins integer not null check(coins between 0 and 60),
  created_at timestamptz not null default now(),
  unique(coupon_id,user_id,product_type,product_id)
);
alter table public.inr_free_coupons enable row level security;
alter table public.inr_coupon_redemptions enable row level security;
revoke all on public.inr_free_coupons, public.inr_coupon_redemptions from public, anon, authenticated;
grant all on public.inr_free_coupons, public.inr_coupon_redemptions to service_role;
insert into public.inr_free_coupons(id,code_hash) values
  ('astrofree-v1','d68796d32d7556a1201cb4f53511399c2d1859eb1596d5b34ede842b1fc2b49a');

create function public.redeem_inr_free_coupon(
  p_coupon text, p_hash text, p_user text, p_type text, p_product text, p_name text,
  p_original bigint, p_features jsonb, p_coins integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare u public.users%rowtype; r public.inr_coupon_redemptions%rowtype;
  grants jsonb; feature text; repeated boolean := false;
begin
  -- Lock the switch as well as the user: disabling and parallel claims are serialized.
  perform 1 from public.inr_free_coupons where id=p_coupon and code_hash=p_hash and enabled for share;
  if not found then raise exception 'Coupon inactive'; end if;
  select * into u from public.users where id=p_user for update;
  if u.id is null then raise exception 'Account unavailable'; end if;
  if exists(select 1 from public.customer_markets where user_id=p_user and market='US') then
    raise exception 'INR accounts only';
  end if;
  if p_type not in ('bundle','report','upsell') or p_original is null or p_original<=0
    or p_coins is null or p_coins<0 or p_coins>60 or (p_type<>'bundle' and p_coins<>0)
    or p_features is null or jsonb_typeof(p_features)<>'array' or jsonb_array_length(p_features)=0 then
    raise exception 'Invalid grant';
  end if;
  select * into r from public.inr_coupon_redemptions
    where coupon_id=p_coupon and user_id=p_user and product_type=p_type and product_id=p_product;
  if r.id is not null then repeated:=true;
  else
    grants:=coalesce(u.unlocked_features,'{}'::jsonb);
    for feature in select jsonb_array_elements_text(p_features) loop
      if feature not in ('palmReading','birthChart','compatibilityTest','soulmateSketch','futurePartnerReport',
        'prediction2026','vastuShastraGuide','auraColorReport','astrocartographyReport','pastLifeReport',
        'numerologyReport','spiritAnimalReport','witchArchetypeReport') then raise exception 'Unknown report'; end if;
      grants:=grants||jsonb_build_object(feature,true);
    end loop;
    insert into public.inr_coupon_redemptions(coupon_id,user_id,product_type,product_id,product_name,original_amount_paise,features,coins)
      values(p_coupon,p_user,p_type,p_product,p_name,p_original,p_features,p_coins) returning * into r;
    update public.users set unlocked_features=grants,coins=coalesce(coins,0)+p_coins,
      scans_allowed=case when grants->>'palmReading'='true' then greatest(coalesce(scans_allowed,0),1) else scans_allowed end,
      updated_at=now() where id=p_user returning * into u;
    -- Never mark a payment paid or replace existing bundle/payment identifiers.
  end if;
  return jsonb_build_object('redemptionId',r.id,'alreadyRedeemed',repeated,'amount',0,'currency','INR',
    'userId',u.id,'email',u.email,'unlockedFeatures',u.unlocked_features,'coins',u.coins);
end; $$;
revoke all on function public.redeem_inr_free_coupon(text,text,text,text,text,text,bigint,jsonb,integer) from public,anon,authenticated;
grant execute on function public.redeem_inr_free_coupon(text,text,text,text,text,text,bigint,jsonb,integer) to service_role;

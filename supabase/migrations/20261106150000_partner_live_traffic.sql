create function public.read_partner_live_traffic(p_time_zone text, p_checked_at timestamptz)
returns table (channel text, today_views bigint, recent_views bigint)
language sql stable set search_path = ''
as $$
  with bounds as (
    select p_checked_at as checked_at,
      date_trunc('day', p_checked_at at time zone p_time_zone) at time zone p_time_zone as midnight,
      p_checked_at - interval '30 minutes' as recent_start
  ), entry_views as (
    select e.created_at, e.utm_source, e.url
    from public.marketing_events e cross join bounds b
    where e.created_at >= least(b.midnight, b.recent_start) and e.created_at <= b.checked_at
      and e.event_name = 'page_view'
      and rtrim(split_part(coalesce(e.path, e.route), '?', 1), '/') in ('', '/discover', '/soulmate', '/soulmate/discover')
    union all
    -- The US funnel records its entry views separately.
    select e.created_at, e.utm_source, e.url
    from public.us_soulmate_marketing_events e cross join bounds b
    where e.created_at >= least(b.midnight, b.recent_start) and e.created_at <= b.checked_at
      and e.event_name = 'us_soulmate_landing_view'
      and rtrim(split_part(coalesce(e.path, e.route), '?', 1), '/') in ('/us/soulmate', '/us/soulmate/discover')
  ), tags as (
    select created_at, lower(trim(utm_source)) as saved_source,
      lower(split_part(split_part(coalesce(url, ''), '#', 1), '?', 2)) as query
    from entry_views
  ), attributed as (
    select created_at,
      case
        when query ~ '(^|&)(gclid|gbraid|wbraid)=[^&]+'
          or (query ~ '(^|&)utm_source=(google|google_ads|googleads)(&|$)'
            and query ~ '(^|&)utm_medium=(cpc|ppc|paid|paidsearch|paid_search|cpm)(&|$)')
          then 'google'
        when query ~ '(^|&)meta_(campaign|adset|ad)_id=[0-9]+(&|$)'
          or (query ~ '(^|&)utm_source=(meta|facebook|instagram|fb|ig|facebook\.com|instagram\.com|m\.facebook\.com|l\.facebook\.com|l\.instagram\.com)(&|$)'
            and query ~ '(^|&)utm_medium=(cpc|ppc|paid|paid_social|paid-social|paidsocial|paid(%20|\+)social|cpm)(&|$)')
          then 'meta'
        else 'other'
      end as channel
    from tags
    where saved_source is distinct from 'codex_qa'
      and query !~ '(^|&)utm_source=codex_qa(&|$)'
  )
  select a.channel,
    count(*) filter (where a.created_at >= b.midnight),
    count(*) filter (where a.created_at >= b.recent_start)
  from attributed a cross join bounds b
  group by a.channel;
$$;

revoke all on function public.read_partner_live_traffic(text, timestamptz) from public, anon, authenticated;
grant execute on function public.read_partner_live_traffic(text, timestamptz) to service_role;

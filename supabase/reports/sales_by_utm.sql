-- Set the IST date range in each date_range CTE. Amount is stored in paise.

-- 1. Paid orders by campaign, ad set (utm_term), and ad (utm_content).
WITH date_range AS (
  SELECT DATE '2026-10-01' AS start_date, DATE '2026-10-31' AS end_date
)
SELECT p.utm_campaign, p.utm_term, p.utm_content,
       COUNT(*) AS orders,
       SUM(p.amount) / 100.0 AS revenue_inr,
       MIN(p.created_at AT TIME ZONE 'Asia/Kolkata') AS first_order_ist,
       MAX(p.created_at AT TIME ZONE 'Asia/Kolkata') AS last_order_ist
FROM public.payments p CROSS JOIN date_range d
WHERE p.payment_status IN ('paid', 'success', 'captured')
  AND p.created_at >= (d.start_date::timestamp AT TIME ZONE 'Asia/Kolkata')
  AND p.created_at < ((d.end_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
GROUP BY p.utm_campaign, p.utm_term, p.utm_content
ORDER BY revenue_inr DESC;

-- 2. Paid orders by IST hour and campaign.
WITH date_range AS (
  SELECT DATE '2026-10-01' AS start_date, DATE '2026-10-31' AS end_date
)
SELECT p.utm_campaign,
       EXTRACT(HOUR FROM p.created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour_ist,
       COUNT(*) AS orders,
       SUM(p.amount) / 100.0 AS revenue_inr
FROM public.payments p CROSS JOIN date_range d
WHERE p.payment_status IN ('paid', 'success', 'captured')
  AND p.created_at >= (d.start_date::timestamp AT TIME ZONE 'Asia/Kolkata')
  AND p.created_at < ((d.end_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
GROUP BY p.utm_campaign, hour_ist
ORDER BY p.utm_campaign NULLS LAST, hour_ist;

-- 3. Every paid order with campaign, ad set, and exact Meta ad ID.
WITH date_range AS (
  SELECT DATE '2026-10-01' AS start_date, DATE '2026-10-31' AS end_date
)
SELECT p.id, p.created_at AT TIME ZONE 'Asia/Kolkata' AS created_at_ist,
       p.amount / 100.0 AS amount_inr, p.utm_campaign, p.utm_term,
       p.utm_content, p.fb_ad_id
FROM public.payments p CROSS JOIN date_range d
WHERE p.payment_status IN ('paid', 'success', 'captured')
  AND p.created_at >= (d.start_date::timestamp AT TIME ZONE 'Asia/Kolkata')
  AND p.created_at < ((d.end_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
ORDER BY p.created_at DESC;

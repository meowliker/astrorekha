INSERT INTO public.ab_tests (
  id,
  name,
  status,
  traffic_split,
  variants,
  created_at,
  updated_at
)
VALUES (
  'paywall-cosmic-bundle-v1',
  'Paywall Cosmic Bundle Test',
  'completed',
  0,
  '{
    "A": { "weight": 100, "page": "current-bundles" },
    "B": { "weight": 0, "page": "cosmic-bundle" }
  }'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  traffic_split = EXCLUDED.traffic_split,
  variants = EXCLUDED.variants,
  updated_at = NOW();

ALTER TABLE public.ab_tests
  ADD COLUMN IF NOT EXISTS variants JSONB;

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
  'active',
  0.3,
  '{
    "A": { "weight": 70, "page": "current-bundles" },
    "B": { "weight": 30, "page": "cosmic-bundle" }
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

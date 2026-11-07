-- 0003_seed_plans.sql — DRAFT plans ("ร่าง"). Prices are placeholders, not offers; see docs/BILLING-PLAN.md.
INSERT INTO plans (id, name_th, name_en, price_month_satang, price_year_satang, status, sort, notes) VALUES
  ('free',       'ฟรี',        'Free',        0,      0,       'active', 0, 'All features unlocked while FREE_MODE=true'),
  ('pro',        'โปร',        'Pro',         99000,  990000,  'draft',  1, 'ร่าง — placeholder price'),
  ('business',   'ธุรกิจ',     'Business',    390000, 3900000, 'draft',  2, 'ร่าง — placeholder price'),
  ('enterprise', 'องค์กร',     'Enterprise',  NULL,   NULL,    'draft',  3, 'ร่าง — contact sales');

-- Quotas enforced server-side only when FREE_MODE=false. NULL = unlimited. AI quotas follow the unit economics in
-- docs/BILLING-PLAN.md (~2.5–3.5 THB of model cost per reading).
INSERT INTO entitlements (plan_id, feature, quota, period) VALUES
  ('free',       'ai_reading',      3,    'day'),
  ('free',       'analytics_days',  7,    'day'),
  ('free',       'csv_export',      0,    'month'),
  ('free',       'hub_nodes',       1,    'month'),
  ('pro',        'ai_reading',      100,  'month'),
  ('pro',        'analytics_days',  90,   'day'),
  ('pro',        'csv_export',      NULL, 'month'),
  ('pro',        'hub_nodes',       3,    'month'),
  ('business',   'ai_reading',      600,  'month'),
  ('business',   'analytics_days',  400,  'day'),
  ('business',   'csv_export',      NULL, 'month'),
  ('business',   'hub_nodes',       20,   'month'),
  ('enterprise', 'ai_reading',      NULL, 'day'),
  ('enterprise', 'analytics_days',  NULL, 'day'),
  ('enterprise', 'csv_export',      NULL, 'month'),
  ('enterprise', 'hub_nodes',       NULL, 'month');

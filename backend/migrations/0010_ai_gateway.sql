-- 0010_ai_gateway.sql — round 17 P5: AI gateway monthly aggregates per feature (backend/src/ai/db.js).
-- Counts and sums only: requests, successes, fallbacks by reason, provider calls by kind and provider, tokens, cost in
-- micro-USD and a latency histogram. No content, no user id, no IP, no request id. Kept (a few dozen rows per month);
-- shown in admin → AI Gateway → monthly usage. The monthly BUDGET counter stays in usage_counters (subject 'ai:budget',
-- written only for features with a budget cap), next to the plan quotas.
CREATE TABLE ai_usage_monthly (
  month TEXT NOT NULL,      -- Bangkok month 'YYYY-MM'
  feature TEXT NOT NULL,    -- gateway feature id (fortune_reword, pc_fields …)
  metric TEXT NOT NULL,     -- req | req_ok | fb:<reason> | calls | cost | in_tok | out_tok | k:<kind> | lat:<ms bucket> | prov:<provider>
  n INTEGER NOT NULL,
  PRIMARY KEY (month, feature, metric)
);

-- 0012_ai_keys.sql — AI provider keys set from the admin panel (backend/src/ai/keystore.js; owner spec 2026-11-11).
-- Write-only: the key is never returned. Stored envelope-encrypted: a random data key per row encrypts the key
-- (AES-GCM, bound to the provider), and the data key itself is encrypted with the Worker secret SECRETS_KEK.
-- A key set here is used before the Worker secret of the same provider; removing the row falls back to the secret.
CREATE TABLE ai_provider_keys (
  provider TEXT PRIMARY KEY,                -- adapters/index.js PROVIDER_IDS
  key_enc TEXT NOT NULL,                    -- JSON {v: 1, dek: {iv, ct}, iv, ct, kek_id}
  last4 TEXT NOT NULL,                      -- last 4 characters, the only part ever shown
  set_at INTEGER NOT NULL,
  checked_at INTEGER,                       -- last "test key" from the panel
  check_ok INTEGER                          -- 1 = OK, 0 = FAIL, NULL = not tested
);

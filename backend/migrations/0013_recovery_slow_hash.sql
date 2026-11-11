-- 0013_recovery_slow_hash.sql — admin recovery codes stored with a slow, salted hash (launch item L51, owner 2026-11-11).
-- New rows: hash = HMAC-SHA256 lookup under a key derived from SECRETS_KEK; salt = random 16 bytes (base64);
-- slow_hash = PBKDF2-SHA256(code, salt, iterations) (base64). Rows issued before this migration keep salt NULL (plain
-- SHA-256) and work until the owner issues a new set (the security tab asks for it); a new set deletes every row.
ALTER TABLE admin_recovery_codes ADD COLUMN salt TEXT;
ALTER TABLE admin_recovery_codes ADD COLUMN slow_hash TEXT;
ALTER TABLE admin_recovery_codes ADD COLUMN iterations INTEGER;

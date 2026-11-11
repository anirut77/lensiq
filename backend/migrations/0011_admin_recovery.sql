-- 0011_admin_recovery.sql — one-time recovery codes for the owner's 2-step sign-in (auth.js).
-- Ten codes are issued when 2-step verification is turned on (and when the owner asks for a new set). Only the SHA-256
-- of each code is stored; a code is claimed atomically (used_at IS NULL -> timestamp), so it works exactly once.
CREATE TABLE admin_recovery_codes (
  hash TEXT PRIMARY KEY,                    -- SHA-256 hex of "recovery:" + normalised code
  created_at INTEGER NOT NULL,
  used_at INTEGER                           -- NULL = unused
);

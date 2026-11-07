-- 0004_hardening.sql — review round 8: lockout redesign, trusted devices, order tokens, consent version.

-- Account failures decay: a failure older than the decay window restarts the count (auth.js).
ALTER TABLE admin_users ADD COLUMN last_failed_at INTEGER NOT NULL DEFAULT 0;

-- Devices that completed a login get a device token (only its SHA-256 is stored). A valid device token exempts the
-- owner from the account-wide progressive delay and the global login limit, so an attacker cannot lock the owner out.
CREATE TABLE admin_devices (
  hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_used INTEGER NOT NULL
);

-- Buyer-held secret that links a paid plan to the buyer (returned once at checkout, only its hash is stored).
ALTER TABLE customers ADD COLUMN order_token_hash TEXT;

-- Version of the analytics consent text the client claims the visitor accepted (client-asserted, see docs/BACKEND.md).
ALTER TABLE events ADD COLUMN cv TEXT;

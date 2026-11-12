-- 0016_merit_review.sql — Merit reviewer accounts and the review queue (owner decision 2026-11-12; backend/src/reviewers.js,
-- backend/src/merit.js, docs/MERIT-RESULTS.md §8).
--
-- admin_reviewers: a second, restricted back-office account type next to the single owner (admin_users id = 1). A
-- reviewer can only read / edit / review merit content; every other admin route answers 403 forbidden_role (index.js).
-- The owner creates the account (re-auth); the reviewer finishes it with a one-time setup code (only its SHA-256 is
-- stored), their own password (same PBKDF2 hashing as the owner) and REQUIRED 2-step verification (TOTP secret AES-GCM
-- encrypted with SECRETS_KEK, as for the owner). No recovery codes: the owner resets a reviewer who lost the phone.
CREATE TABLE admin_reviewers (
  id TEXT PRIMARY KEY,                      -- 12 hex
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,                       -- NULL until the reviewer sets it with the setup code
  setup_hash TEXT UNIQUE,                   -- SHA-256 of the one-time setup code; NULL once activated
  setup_expires INTEGER,
  totp_secret_enc TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last_step INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_failed_at INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | active | disabled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

-- which account a session / trusted device belongs to (NULL = the owner)
ALTER TABLE admin_sessions ADD COLUMN reviewer_id TEXT;
ALTER TABLE admin_devices ADD COLUMN reviewer_id TEXT;

-- review queue on merit_items: status draft -> reviewed -> published (rejected with a comment; hidden by the owner).
-- Only status = 'published' is ever served by GET /v1/merit/guidance.
ALTER TABLE merit_items ADD COLUMN review_comment TEXT;   -- the latest review comment
ALTER TABLE merit_items ADD COLUMN reviewed_by TEXT;      -- account name of the latest review decision
ALTER TABLE merit_items ADD COLUMN reviewed_at INTEGER;
ALTER TABLE merit_items ADD COLUMN source TEXT;           -- sample | admin | import
-- notes for reviewers only, from the drafts file (JSON {draft_id, disciplines[], sources[{url, publisher, title, accessed}],
-- uncertain}); never served to users (publicGuidance returns the public fields only)
ALTER TABLE merit_items ADD COLUMN review_meta TEXT;
UPDATE merit_items SET source = 'sample' WHERE sample = 1;

-- full edit history per item: who changed which field, when, review decisions and comments. The audit log keeps ids,
-- field names and decisions only; the comment text lives here.
CREATE TABLE merit_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,                      -- 'owner' | 'reviewer:<id>'
  actor_name TEXT NOT NULL,                 -- 'owner' | the reviewer's username at the time
  action TEXT NOT NULL,                     -- create | edit | status | review | import | delete
  decision TEXT,                            -- reviewed | approve | reject (action = review)
  fields TEXT,                              -- JSON array of changed field names
  comment TEXT,
  from_status TEXT,
  to_status TEXT
);
CREATE INDEX merit_revisions_item ON merit_revisions(item_id, id);

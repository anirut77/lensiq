-- 0022_look_salon.sql — salon catalogue approval step (owner decision 2026-11-18; docs/BEAUTY-IMAGE-DESIGN.md §4;
-- backend/src/look-salon.js). NOT applied to the live database by the builder: the owner runs migrations
-- (npm run backend:migrate) after review. Numbered 0022 because branch seller-settings adds 0021.
--
-- A salon's catalogue entry (shape + the salon's own text + a rights tick) is 'pending' until the LENSIQ owner (or, when
-- the Worker var LOOK_SALON_APPROVERS says so, a LENSIQ admin) approves the exact version. Any edit returns it to
-- 'pending' with a new version. Only approved entries are served (GET /v1/look/salon/catalog, LOOK_SALON = "on").
-- No image or photo column exists: shapes are vectors / codes / SVG path data only.
CREATE TABLE look_salon_entries (
  id TEXT PRIMARY KEY,                       -- 12 hex
  salon TEXT NOT NULL DEFAULT 'demo',        -- one LENSIQ-managed salon until organisation accounts exist
  kind TEXT NOT NULL,                        -- brow | lip | liner | hair
  name_th TEXT NOT NULL,                     -- the salon's own text (linted, needs approval)
  name_en TEXT,
  name_zh TEXT,
  desc_th TEXT,
  desc_en TEXT,
  desc_zh TEXT,
  code TEXT,                                 -- the salon's colour / style code (linted)
  shape TEXT NOT NULL,                       -- JSON: brow {card?, points?} | lip {hex, gloss?, card?} | liner {style} | hair {path}
  rights_ok INTEGER NOT NULL,                -- the salon confirms it owns / may use this shape or drawing
  rights_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | approved | rejected | hidden
  version INTEGER NOT NULL DEFAULT 1,        -- +1 on every edit
  approved_version INTEGER,
  approved_by TEXT,                          -- "owner" | "reviewer:<id>"
  approved_at INTEGER,
  reject_reason TEXT,                        -- fixed list in look-salon.js (no free text)
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX look_salon_entries_status ON look_salon_entries(salon, status);

-- per-entry history (also written to audit_log): ids, versions, statuses, field names and lint codes only, never the text
CREATE TABLE look_salon_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL,
  version INTEGER,
  action TEXT NOT NULL,                      -- created | updated | lint_refused | approve_refused | approved | rejected | hidden
  actor TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail TEXT,                               -- JSON {kind?, fields?, hits? (lint codes), reason?, why?}
  at INTEGER NOT NULL
);
CREATE INDEX look_salon_events_entry ON look_salon_events(entry_id, id);

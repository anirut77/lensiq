-- 0017_tryon.sql — Try-On MVP merchant back-office (docs/TRYON-DESIGN.md T2 subset; backend/src/tryon.js, tryon-store.js).
-- NOT applied to the live database by the builder: the owner runs migrations (npm run backend:migrate) after review.
--
-- Roles on the existing admin sign-in (BO-1, owner decision 2026-11-10: no org accounts yet): the restricted accounts of
-- 0016 (admin_reviewers) get a role. 'merit' = the merit reviewer (unchanged default, every existing row); 'tryon_admin'
-- = full try-on catalogue (publish / hide / delete); 'tryon_editor' = create / edit / upload, status draft or in_review
-- only. index.js allows each role only its own routes (403 forbidden_role otherwise).
ALTER TABLE admin_reviewers ADD COLUMN role TEXT NOT NULL DEFAULT 'merit';

-- catalogue items of the (single, LENSIQ-managed) demo shop; shop column kept for org accounts later (TO-D2)
CREATE TABLE tryon_items (
  id TEXT PRIMARY KEY,                       -- 12 hex
  shop TEXT NOT NULL DEFAULT 'demo',
  category TEXT NOT NULL,                    -- fixed list in tryon.js (no underwear / swimwear values exist)
  anchor TEXT NOT NULL,                      -- face | pose (derived from the category)
  name_th TEXT NOT NULL,
  name_en TEXT,
  name_zh TEXT,
  price INTEGER,                             -- satang, as the shop enters it
  sale_price INTEGER,
  vat_included INTEGER NOT NULL DEFAULT 1,
  sizes TEXT,                                -- JSON array
  colours TEXT,                              -- JSON array [{name, hex}]
  product_url TEXT,                          -- https only
  notes TEXT,                                -- back-office only, never public
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | in_review | published | hidden
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX tryon_items_shop_status ON tryon_items(shop, status);

-- one garment cut-out per item (TO-D7: garment cut-outs only, never photos of customers or models). Bytes live in R2
-- when the TRYON_BUCKET binding exists (owner dependency: R2 is not bound today); otherwise in `data` (base64, D1
-- fallback, ≤ 1,000,000 bytes decoded). face_check = the device face-blur result + the editor's confirmation (JSON).
CREATE TABLE tryon_assets (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  w INTEGER NOT NULL,
  h INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  store TEXT NOT NULL,                       -- r2 | d1
  data TEXT,
  face_check TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

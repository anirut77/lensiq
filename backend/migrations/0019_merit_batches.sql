-- 0019_merit_batches.sql — one row per imported drafts file (owner review of the place drafts, 2026-11-14).
-- A drafts file carries a batch id (for example "merit-108-2026-11-12", "places-2026-11-14"). The import refuses a batch
-- id that is already here (409 batch_exists), so the same file cannot be imported twice; the back office lists these
-- rows on the import tab. Each imported draft also keeps the id in merit_items.review_meta (JSON "batch").
-- Back office only: nothing here is ever served to users.
CREATE TABLE merit_batches (
  batch TEXT PRIMARY KEY,                   -- [a-z0-9][a-z0-9._-]{2,59}
  count INTEGER NOT NULL,                   -- drafts imported from the file
  imported_at INTEGER NOT NULL,
  actor TEXT NOT NULL                       -- 'owner' (only the owner imports)
);

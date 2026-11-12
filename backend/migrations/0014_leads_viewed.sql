-- 0014_leads_viewed.sql — quote-request inbox unread count (owner decision 2026-11-12).
-- viewed_at: first time the owner opened the request in the back office (or changed its status). A request is "unread"
-- while status = 'new' AND viewed_at IS NULL; the admin tab shows that number as a badge. No personal data added.
ALTER TABLE leads ADD COLUMN viewed_at INTEGER;

-- 0007_member_session_labels.sql — coarse device label per member session for "my signed-in devices"
-- (GET /api/me/sessions). Only a coarse browser · OS label derived from the User-Agent at sign-in (e.g. "Chrome · Android")
-- is stored — never the raw User-Agent string, never the IP.
ALTER TABLE member_sessions ADD COLUMN ua_label TEXT;

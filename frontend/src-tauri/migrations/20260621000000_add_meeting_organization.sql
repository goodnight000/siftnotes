-- Add lightweight meeting organization fields.
ALTER TABLE meetings ADD COLUMN project TEXT;
ALTER TABLE meetings ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE meetings ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meetings ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_meetings_organization
ON meetings (is_archived, is_pinned, project, created_at);

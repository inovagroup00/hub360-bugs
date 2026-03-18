-- ============================================
-- Hub 360 Bug Tracker — Client Role Setup
-- ============================================

-- Add project_id column to team_members (nullable, for client users)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Update role CHECK constraint to include 'client'
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check CHECK (role IN ('dev', 'pm', 'admin', 'client'));

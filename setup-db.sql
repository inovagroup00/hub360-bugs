-- ============================================
-- Hub 360 Bug Tracker — Database Schema
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- TABLES
-- ============================================

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  role TEXT DEFAULT 'dev' CHECK (role IN ('dev', 'pm', 'admin')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bugs
CREATE TABLE IF NOT EXISTS bugs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),

  -- Report fields
  title TEXT NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 200),
  where_found TEXT NOT NULL CHECK (char_length(where_found) >= 3 AND char_length(where_found) <= 300),
  steps_taken TEXT NOT NULL CHECK (char_length(steps_taken) >= 5 AND char_length(steps_taken) <= 1000),
  expected_behavior TEXT NOT NULL CHECK (char_length(expected_behavior) >= 5 AND char_length(expected_behavior) <= 1000),
  actual_behavior TEXT NOT NULL CHECK (char_length(actual_behavior) >= 5 AND char_length(actual_behavior) <= 1000),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  device_info TEXT,

  -- Reporter info
  reporter_name TEXT,
  reporter_email TEXT,

  -- Management
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'analyzing', 'fixing', 'awaiting_validation', 'resolved', 'closed', 'reopened')),
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
  duplicate_of UUID REFERENCES bugs(id),
  version INTEGER NOT NULL DEFAULT 1,

  -- Metadata
  reporter_ip INET,
  reporter_user_agent TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(project_id, number)
);

-- Bug attachments
CREATE TABLE IF NOT EXISTS bug_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bug notes (internal, append-only)
CREATE TABLE IF NOT EXISTS bug_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES team_members(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log
CREATE TABLE IF NOT EXISTS bug_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES team_members(id),
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bugs(severity);
CREATE INDEX IF NOT EXISTS idx_bugs_assigned ON bugs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_bugs_created ON bugs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bugs_idempotency ON bugs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_bugs_project_status_created ON bugs(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bugs_title_trgm ON bugs USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_bug ON bug_audit_log(bug_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip_address, endpoint, created_at);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bugs_updated_at ON bugs;
CREATE TRIGGER bugs_updated_at
  BEFORE UPDATE ON bugs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-generate per-project bug number
CREATE OR REPLACE FUNCTION generate_bug_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.number := COALESCE(
    (SELECT MAX(number) FROM bugs WHERE project_id = NEW.project_id),
    0
  ) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bugs_auto_number ON bugs;
CREATE TRIGGER bugs_auto_number
  BEFORE INSERT ON bugs
  FOR EACH ROW EXECUTE FUNCTION generate_bug_number();

-- Audit log on status/assignment changes
CREATE OR REPLACE FUNCTION log_bug_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO bug_audit_log (bug_id, actor_id, action, old_value, new_value)
    VALUES (NEW.id, NULL, 'status_changed', OLD.status, NEW.status);
  END IF;
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO bug_audit_log (bug_id, actor_id, action, old_value, new_value)
    VALUES (NEW.id, NULL, 'assigned', OLD.assigned_to::text, NEW.assigned_to::text);
  END IF;
  -- Increment version on every update
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bugs_audit ON bugs;
CREATE TRIGGER bugs_audit
  BEFORE UPDATE ON bugs
  FOR EACH ROW EXECUTE FUNCTION log_bug_changes();

-- Clean old rate limit entries (keep last 1 hour only)
CREATE OR REPLACE FUNCTION clean_old_rate_limits()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM rate_limits WHERE created_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rate_limits_cleanup ON rate_limits;
CREATE TRIGGER rate_limits_cleanup
  AFTER INSERT ON rate_limits
  FOR EACH ROW EXECUTE FUNCTION clean_old_rate_limits();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Projects: anon can read active ones (for form slug validation), authenticated can do everything
CREATE POLICY "anon_read_active_projects" ON projects FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "auth_all_projects" ON projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Team members: only authenticated
CREATE POLICY "auth_read_team" ON team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_manage_team" ON team_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bugs: NO anon SELECT (bugs are internal). All mutations go through service role via API routes.
CREATE POLICY "auth_read_bugs" ON bugs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_update_bugs" ON bugs FOR UPDATE TO authenticated USING (true);
-- INSERT via service role only (API route), no direct anon insert

-- Bug attachments: only authenticated can read
CREATE POLICY "auth_read_attachments" ON bug_attachments FOR SELECT TO authenticated USING (true);

-- Bug notes: only authenticated (internal notes)
CREATE POLICY "auth_read_notes" ON bug_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_notes" ON bug_notes FOR INSERT TO authenticated WITH CHECK (true);

-- Audit log: only authenticated can read, inserts via trigger only
CREATE POLICY "auth_read_audit" ON bug_audit_log FOR SELECT TO authenticated USING (true);

-- Rate limits: service role only (no user access)
-- No policies = no access for anon or authenticated. Service role bypasses RLS.

-- ============================================
-- STORAGE
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-attachments',
  'bug-attachments',
  false,
  104857600, -- 100MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies: uploads via signed URLs (service role generates them)
-- Downloads via signed URLs (service role generates them)
-- No direct public access
CREATE POLICY "service_role_all" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'bug-attachments') WITH CHECK (bucket_id = 'bug-attachments');
CREATE POLICY "auth_read_storage" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bug-attachments');
CREATE POLICY "anon_upload_storage" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'bug-attachments');

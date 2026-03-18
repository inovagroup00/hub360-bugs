-- ============================================
-- Hub 360 Bug Tracker — Report Functions
-- Run this in your Supabase SQL editor
-- ============================================

-- Partial index for performance on status_changed audit entries
CREATE INDEX IF NOT EXISTS idx_audit_status_changed
  ON bug_audit_log(bug_id, action, new_value, created_at)
  WHERE action = 'status_changed';

-- ============================================
-- Weekly trend: bugs created vs resolved per week
-- ============================================
CREATE OR REPLACE FUNCTION report_weekly_trend(
  p_date_to date,
  p_weeks int,
  p_project_id uuid DEFAULT NULL
)
RETURNS TABLE(week date, created bigint, resolved bigint)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_date_from date;
BEGIN
  v_date_from := p_date_to - (p_weeks * 7);

  RETURN QUERY
  WITH weeks AS (
    SELECT generate_series(
      date_trunc('week', v_date_from::timestamptz)::date,
      date_trunc('week', p_date_to::timestamptz)::date,
      '1 week'::interval
    )::date AS week_start
  ),
  created_counts AS (
    SELECT date_trunc('week', b.created_at)::date AS w, COUNT(*) AS cnt
    FROM bugs b
    WHERE b.created_at >= v_date_from::timestamptz
      AND b.created_at < (p_date_to + 1)::timestamptz
      AND (p_project_id IS NULL OR b.project_id = p_project_id)
    GROUP BY 1
  ),
  resolved_counts AS (
    SELECT date_trunc('week', a.created_at)::date AS w, COUNT(DISTINCT a.bug_id) AS cnt
    FROM bug_audit_log a
    JOIN bugs b ON b.id = a.bug_id
    WHERE a.action = 'status_changed'
      AND a.new_value IN ('resolved', 'closed')
      AND a.created_at >= v_date_from::timestamptz
      AND a.created_at < (p_date_to + 1)::timestamptz
      AND (p_project_id IS NULL OR b.project_id = p_project_id)
    GROUP BY 1
  )
  SELECT
    wk.week_start AS week,
    COALESCE(c.cnt, 0) AS created,
    COALESCE(r.cnt, 0) AS resolved
  FROM weeks wk
  LEFT JOIN created_counts c ON c.w = wk.week_start
  LEFT JOIN resolved_counts r ON r.w = wk.week_start
  ORDER BY wk.week_start;
END;
$$;

-- ============================================
-- Average resolution time in hours
-- ============================================
CREATE OR REPLACE FUNCTION report_avg_resolution(
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_project_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result numeric;
BEGIN
  SELECT AVG(EXTRACT(EPOCH FROM (a.created_at - b.created_at)) / 3600.0)
  INTO v_result
  FROM bug_audit_log a
  JOIN bugs b ON b.id = a.bug_id
  WHERE a.action = 'status_changed'
    AND a.new_value IN ('resolved', 'closed')
    AND a.created_at >= p_date_from
    AND a.created_at <= p_date_to
    AND (p_project_id IS NULL OR b.project_id = p_project_id)
    AND a.id = (
      SELECT a2.id FROM bug_audit_log a2
      WHERE a2.bug_id = a.bug_id
        AND a2.action = 'status_changed'
        AND a2.new_value IN ('resolved', 'closed')
      ORDER BY a2.created_at ASC
      LIMIT 1
    );

  RETURN COALESCE(v_result, 0);
END;
$$;

-- ============================================
-- Resolved bugs detail list
-- ============================================
CREATE OR REPLACE FUNCTION report_resolved_bugs(
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_project_id uuid DEFAULT NULL,
  p_team_member_id uuid DEFAULT NULL,
  p_limit int DEFAULT 100
)
RETURNS TABLE(
  bug_id uuid,
  bug_number int,
  title text,
  severity text,
  project_name text,
  assigned_to_name text,
  created_at timestamptz,
  resolved_at timestamptz,
  resolution_hours numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS bug_id,
    b.number AS bug_number,
    b.title,
    b.severity,
    p.name AS project_name,
    tm.name AS assigned_to_name,
    b.created_at,
    a.created_at AS resolved_at,
    ROUND(EXTRACT(EPOCH FROM (a.created_at - b.created_at)) / 3600.0, 1) AS resolution_hours
  FROM bug_audit_log a
  JOIN bugs b ON b.id = a.bug_id
  JOIN projects p ON p.id = b.project_id
  LEFT JOIN team_members tm ON tm.id = b.assigned_to
  WHERE a.action = 'status_changed'
    AND a.new_value IN ('resolved', 'closed')
    AND a.created_at >= p_date_from
    AND a.created_at <= p_date_to
    AND (p_project_id IS NULL OR b.project_id = p_project_id)
    AND (p_team_member_id IS NULL OR b.assigned_to = p_team_member_id)
    AND a.id = (
      SELECT a2.id FROM bug_audit_log a2
      WHERE a2.bug_id = a.bug_id
        AND a2.action = 'status_changed'
        AND a2.new_value IN ('resolved', 'closed')
      ORDER BY a2.created_at ASC
      LIMIT 1
    )
  ORDER BY a.created_at DESC
  LIMIT p_limit;
END;
$$;

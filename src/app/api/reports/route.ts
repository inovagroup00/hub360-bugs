import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Auth check (same pattern as /api/bugs GET)
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Token invalido" } },
        { status: 401 }
      );
    }

    // Check if user is a client and get their project_id
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("id, role, project_id")
      .eq("auth_user_id", user.id)
      .single();

    const isClientUser = teamMember?.role === "client";
    const clientProjectId = isClientUser ? teamMember?.project_id : null;

    // If client has no project_id, deny access
    if (isClientUser && !clientProjectId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Utilizador cliente sem projeto associado" } },
        { status: 403 }
      );
    }

    // Parse query params
    const url = new URL(request.url);
    const dateFromParam = url.searchParams.get("date_from");
    const dateToParam = url.searchParams.get("date_to");
    let projectId = url.searchParams.get("project_id");
    const teamMemberId = url.searchParams.get("team_member_id");

    // Security: force client users to only query their own project
    if (isClientUser) {
      if (projectId && projectId !== clientProjectId) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Acesso negado a este projeto" } },
          { status: 403 }
        );
      }
      projectId = clientProjectId;
    }

    // Default dates: 90 days ago to today
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const dateFrom = dateFromParam || ninetyDaysAgo.toISOString().split("T")[0];
    const dateTo = dateToParam || now.toISOString().split("T")[0];

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Formato de data invalido. Use YYYY-MM-DD." } },
        { status: 400 }
      );
    }

    if (dateFrom > dateTo) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Data inicial deve ser anterior a data final." } },
        { status: 400 }
      );
    }

    // Validate UUIDs if provided
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (projectId && !uuidRegex.test(projectId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "project_id invalido" } },
        { status: 400 }
      );
    }
    if (teamMemberId && !uuidRegex.test(teamMemberId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "team_member_id invalido" } },
        { status: 400 }
      );
    }

    const dateFromISO = `${dateFrom}T00:00:00.000Z`;
    const dateToISO = `${dateTo}T23:59:59.999Z`;

    // Build base queries with optional project filter
    const buildBugsQuery = (select: string, opts?: { count?: "exact"; head?: boolean }) => {
      let q = supabase.from("bugs").select(select, opts);
      if (projectId) q = q.eq("project_id", projectId);
      return q;
    };

    // Run all queries in parallel
    const [
      totalResult,
      periodResult,
      openResult,
      byStatusResult,
      bySeverityResult,
      byProjectResult,
      resolvedBugsResult,
      projectsResult,
      teamMembersResult,
    ] = await Promise.all([
      // 1. Total bugs (all time)
      buildBugsQuery("*", { count: "exact", head: true }),

      // 2. Bugs in period
      buildBugsQuery("*", { count: "exact", head: true })
        .gte("created_at", dateFromISO)
        .lte("created_at", dateToISO),

      // 3. Open bugs (not resolved/closed)
      buildBugsQuery("*", { count: "exact", head: true })
        .not("status", "in", "(resolved,closed)"),

      // 4. Bugs by status
      buildBugsQuery("status")
        .gte("created_at", dateFromISO)
        .lte("created_at", dateToISO),

      // 5. Bugs by severity
      buildBugsQuery("severity")
        .gte("created_at", dateFromISO)
        .lte("created_at", dateToISO),

      // 6. Bugs by project (all projects, ignore project filter for this one)
      supabase
        .from("bugs")
        .select("project_id, project:projects(name)")
        .gte("created_at", dateFromISO)
        .lte("created_at", dateToISO),

      // 7. Resolved bugs (fallback: use bugs table with status filter)
      (() => {
        let q = supabase
          .from("bugs")
          .select("id, number, title, severity, project_id, assigned_to, created_at, updated_at, project:projects(name), assignee:team_members!bugs_assigned_to_fkey(name)")
          .in("status", ["resolved", "closed"])
          .gte("updated_at", dateFromISO)
          .lte("updated_at", dateToISO)
          .order("updated_at", { ascending: false })
          .limit(100);
        if (projectId) q = q.eq("project_id", projectId);
        if (teamMemberId) q = q.eq("assigned_to", teamMemberId);
        return q;
      })(),

      // 8. Projects list (for filter dropdown)
      supabase.from("projects").select("id, name").order("name"),

      // 9. Team members list (for filter dropdown)
      supabase.from("team_members").select("id, name").eq("is_active", true).order("name"),
    ]);

    // Aggregate status counts
    const statusCounts: Record<string, number> = {};
    if (byStatusResult.data) {
      for (const row of byStatusResult.data) {
        const s = (row as unknown as { status: string }).status;
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      }
    }

    // Aggregate severity counts
    const severityCounts: Record<string, number> = {};
    if (bySeverityResult.data) {
      for (const row of bySeverityResult.data) {
        const s = (row as unknown as { severity: string }).severity;
        severityCounts[s] = (severityCounts[s] || 0) + 1;
      }
    }

    // Aggregate project counts
    const projectCounts: Record<string, { name: string; count: number }> = {};
    if (byProjectResult.data) {
      for (const row of byProjectResult.data) {
        const r = row as unknown as { project_id: string; project: { name: string }[] | null };
        const pid = r.project_id;
        if (!projectCounts[pid]) {
          const proj = r.project as unknown;
          const projName = Array.isArray(proj) ? proj[0]?.name : (proj as { name: string } | null)?.name;
          projectCounts[pid] = { name: projName || "Sem projeto", count: 0 };
        }
        projectCounts[pid].count++;
      }
    }

    // Calculate average resolution time (fallback: use updated_at - created_at for resolved bugs)
    let avgResolutionHours = 0;
    if (resolvedBugsResult.data && resolvedBugsResult.data.length > 0) {
      const totalHours = resolvedBugsResult.data.reduce((sum, bug) => {
        const created = new Date(bug.created_at).getTime();
        const resolved = new Date(bug.updated_at).getTime();
        return sum + (resolved - created) / (1000 * 60 * 60);
      }, 0);
      avgResolutionHours = Math.round((totalHours / resolvedBugsResult.data.length) * 10) / 10;
    }

    // Weekly trend (fallback: compute from bugs data)
    const weeklyTrend: { week: string; created: number; resolved: number }[] = [];
    {
      const weeks = 8;
      const toDate = new Date(dateTo + "T23:59:59.999Z");
      for (let i = weeks - 1; i >= 0; i--) {
        const weekEnd = new Date(toDate.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        weeklyTrend.push({
          week: weekStart.toISOString().split("T")[0],
          created: 0,
          resolved: 0,
        });
      }

      // Count created bugs per week from byStatusResult (which has all period bugs)
      if (byStatusResult.data) {
        // We need created_at for weekly grouping - re-query with date
        // Actually we already have the period bugs, but without created_at.
        // Use a simpler approach: the resolvedBugsResult has dates.
      }

      // For weekly trend, do a separate lightweight query
      const trendBugsRes = await supabase
        .from("bugs")
        .select("created_at, status, updated_at")
        .gte("created_at", weeklyTrend[0]?.week ? `${weeklyTrend[0].week}T00:00:00.000Z` : dateFromISO)
        .lte("created_at", dateToISO)
        .then((res) => res);

      if (trendBugsRes.data) {
        for (const bug of trendBugsRes.data) {
          const createdDate = new Date(bug.created_at).getTime();
          for (let j = 0; j < weeklyTrend.length; j++) {
            const ws = new Date(weeklyTrend[j].week + "T00:00:00.000Z").getTime();
            const we = ws + 7 * 24 * 60 * 60 * 1000;
            if (createdDate >= ws && createdDate < we) {
              weeklyTrend[j].created++;
              break;
            }
          }
          // Count resolved
          if (
            (bug.status === "resolved" || bug.status === "closed") &&
            bug.updated_at
          ) {
            const resolvedDate = new Date(bug.updated_at).getTime();
            for (let j = 0; j < weeklyTrend.length; j++) {
              const ws = new Date(weeklyTrend[j].week + "T00:00:00.000Z").getTime();
              const we = ws + 7 * 24 * 60 * 60 * 1000;
              if (resolvedDate >= ws && resolvedDate < we) {
                weeklyTrend[j].resolved++;
                break;
              }
            }
          }
        }
      }
    }

    // Format resolved bugs for response
    const resolvedBugs = (resolvedBugsResult.data || []).map((bug) => {
      const created = new Date(bug.created_at).getTime();
      const resolved = new Date(bug.updated_at).getTime();
      const hours = Math.round(((resolved - created) / (1000 * 60 * 60)) * 10) / 10;
      return {
        id: bug.id,
        number: bug.number,
        title: bug.title,
        severity: bug.severity,
        project_name: (() => { const p = bug.project as unknown; return Array.isArray(p) ? p[0]?.name : (p as { name: string } | null)?.name; })() || "-",
        assigned_to_name: (() => { const a = bug.assignee as unknown; return Array.isArray(a) ? a[0]?.name : (a as { name: string } | null)?.name; })() || "-",
        created_at: bug.created_at,
        resolved_at: bug.updated_at,
        resolution_hours: hours,
      };
    });

    return NextResponse.json({
      total_bugs: totalResult.count || 0,
      period_bugs: periodResult.count || 0,
      avg_resolution_hours: avgResolutionHours,
      open_bugs: openResult.count || 0,
      by_status: statusCounts,
      by_severity: severityCounts,
      by_project: Object.values(projectCounts).sort((a, b) => b.count - a.count),
      weekly_trend: weeklyTrend,
      resolved_bugs: resolvedBugs,
      projects: projectsResult.data || [],
      team_members: teamMembersResult.data || [],
      date_from: dateFrom,
      date_to: dateTo,
    });
  } catch (err) {
    console.error("Reports API error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      { status: 500 }
    );
  }
}

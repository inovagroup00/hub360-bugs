import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { getClientIP, generateIdempotencyKey } from "@/lib/utils";

// POST - Create a new bug (public, used by report form)
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const ip = getClientIP(request);

    // Rate limiting: 10 per hour per IP
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("endpoint", "create_bug")
      .gte("created_at", oneHourAgo);

    if (count !== null && count >= 10) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Muitas submissoes. Tente novamente em 1 hora.",
          },
        },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Validate required fields
    const required = [
      "project_slug",
      "title",
      "where_found",
      "steps_taken",
      "expected_behavior",
      "actual_behavior",
      "severity",
    ];
    const missing = required.filter((f) => !body[f]?.trim());
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Campos obrigatorios faltando",
            fields: Object.fromEntries(
              missing.map((f) => [f, "Campo obrigatorio"])
            ),
          },
        },
        { status: 400 }
      );
    }

    // Validate severity
    if (!["critical", "high", "medium", "low"].includes(body.severity)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Gravidade invalida",
            fields: { severity: "Valor invalido" },
          },
        },
        { status: 400 }
      );
    }

    // Get project by slug
    const { data: project, error: projError } = await supabase
      .from("projects")
      .select("id, is_active")
      .eq("slug", body.project_slug)
      .single();

    if (projError || !project) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Projeto nao encontrado",
          },
        },
        { status: 404 }
      );
    }

    if (!project.is_active) {
      return NextResponse.json(
        {
          error: {
            code: "PROJECT_INACTIVE",
            message: "Este projeto nao esta aceitando reports no momento.",
          },
        },
        { status: 403 }
      );
    }

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(
      project.id,
      body.title,
      body.steps_taken,
      ip
    );

    // Check for duplicate submission
    const { data: existing } = await supabase
      .from("bugs")
      .select("id, number")
      .eq("idempotency_key", idempotencyKey)
      .single();

    if (existing) {
      return NextResponse.json({
        success: true,
        bug: { id: existing.id, number: existing.number },
        duplicate: true,
      });
    }

    // Insert bug
    const { data: bug, error: insertError } = await supabase
      .from("bugs")
      .insert({
        project_id: project.id,
        title: body.title.trim().substring(0, 200),
        where_found: body.where_found.trim().substring(0, 300),
        steps_taken: body.steps_taken.trim().substring(0, 1000),
        expected_behavior: body.expected_behavior.trim().substring(0, 1000),
        actual_behavior: body.actual_behavior.trim().substring(0, 1000),
        severity: body.severity,
        device_info: body.device_info?.trim().substring(0, 200) || null,
        reporter_name: body.reporter_name?.trim().substring(0, 100) || null,
        reporter_email: body.reporter_email?.trim().substring(0, 200) || null,
        reporter_ip: ip,
        reporter_user_agent:
          request.headers.get("user-agent")?.substring(0, 500) || null,
        idempotency_key: idempotencyKey,
      })
      .select("id, number")
      .single();

    if (insertError) {
      console.error("Insert bug error:", insertError);
      return NextResponse.json(
        {
          error: {
            code: "INSERT_ERROR",
            message: "Erro ao criar bug. Tente novamente.",
          },
        },
        { status: 500 }
      );
    }

    // Record rate limit
    await supabase.from("rate_limits").insert({
      ip_address: ip,
      endpoint: "create_bug",
    });

    // Handle attachment paths (files uploaded separately)
    if (body.attachment_paths && Array.isArray(body.attachment_paths)) {
      const attachments = body.attachment_paths.map(
        (a: { path: string; name: string; type: string; size: number }) => ({
          bug_id: bug.id,
          file_name: a.name,
          file_type: a.type,
          file_size: a.size,
          storage_path: a.path,
        })
      );

      if (attachments.length > 0) {
        await supabase.from("bug_attachments").insert(attachments);
      }
    }

    return NextResponse.json({
      success: true,
      bug: { id: bug.id, number: bug.number },
    });
  } catch (err) {
    console.error("Create bug error:", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro interno. Tente novamente.",
        },
      },
      { status: 500 }
    );
  }
}

// GET - List bugs (authenticated only)
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Check auth
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

    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id");
    const status = url.searchParams.get("status");
    const severity = url.searchParams.get("severity");
    const assignedTo = url.searchParams.get("assigned_to");
    const search = url.searchParams.get("search");
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("page_size") || "30");
    const sortBy = url.searchParams.get("sort_by") || "created_at";
    const sortDir = url.searchParams.get("sort_dir") || "desc";

    let query = supabase
      .from("bugs")
      .select(
        "*, project:projects(id, name, slug), assignee:team_members!bugs_assigned_to_fkey(id, name, email, avatar_url)",
        { count: "exact" }
      );

    if (projectId) query = query.eq("project_id", projectId);
    if (status) {
      const statuses = status.split(",");
      query = query.in("status", statuses);
    }
    if (severity) {
      const severities = severity.split(",");
      query = query.in("severity", severities);
    }
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    if (search) query = query.ilike("title", `%${search}%`);

    const ascending = sortDir === "asc";
    query = query.order(sortBy, { ascending });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: bugs, count, error } = await query;

    if (error) {
      console.error("List bugs error:", error);
      return NextResponse.json(
        { error: { code: "QUERY_ERROR", message: "Erro ao buscar bugs" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      bugs: bugs || [],
      total: count || 0,
      page,
      page_size: pageSize,
      total_pages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    console.error("List bugs error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      { status: 500 }
    );
  }
}

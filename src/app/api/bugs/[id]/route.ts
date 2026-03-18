import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

// GET - Get single bug with all details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;

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
    } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Token invalido" } },
        { status: 401 }
      );
    }

    const { data: bug, error } = await supabase
      .from("bugs")
      .select(
        "*, project:projects(id, name, slug), assignee:team_members!bugs_assigned_to_fkey(id, name, email, avatar_url)"
      )
      .eq("id", id)
      .single();

    if (error || !bug) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Bug nao encontrado" } },
        { status: 404 }
      );
    }

    // Get attachments
    const { data: attachments } = await supabase
      .from("bug_attachments")
      .select("*")
      .eq("bug_id", id)
      .order("created_at");

    // Get notes
    const { data: notes } = await supabase
      .from("bug_notes")
      .select("*, author:team_members(id, name, email, avatar_url)")
      .eq("bug_id", id)
      .order("created_at", { ascending: true });

    // Get audit log
    const { data: auditLog } = await supabase
      .from("bug_audit_log")
      .select("*, actor:team_members(id, name)")
      .eq("bug_id", id)
      .order("created_at", { ascending: true });

    // Generate signed URLs for attachments
    const attachmentsWithUrls = await Promise.all(
      (attachments || []).map(async (att) => {
        const { data } = await supabase.storage
          .from("bug-attachments")
          .createSignedUrl(att.storage_path, 3600); // 1 hour
        return { ...att, url: data?.signedUrl || null };
      })
    );

    return NextResponse.json({
      ...bug,
      attachments: attachmentsWithUrls,
      notes: notes || [],
      audit_log: auditLog || [],
    });
  } catch (err) {
    console.error("Get bug error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      { status: 500 }
    );
  }
}

// PATCH - Update bug (status, assignment, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;

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
    } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Token invalido" } },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Optimistic locking
    if (body.version !== undefined) {
      const { data: current } = await supabase
        .from("bugs")
        .select("version")
        .eq("id", id)
        .single();

      if (current && current.version !== body.version) {
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message:
                "Este bug foi atualizado por outra pessoa. Recarregue e tente novamente.",
            },
          },
          { status: 409 }
        );
      }
    }

    // Build update object - only allow safe fields
    const allowedFields: Record<string, unknown> = {};
    if (body.status) {
      const validStatuses = [
        "new",
        "analyzing",
        "fixing",
        "awaiting_validation",
        "resolved",
        "closed",
        "reopened",
      ];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Status invalido",
            },
          },
          { status: 400 }
        );
      }
      allowedFields.status = body.status;
    }
    if (body.assigned_to !== undefined) {
      allowedFields.assigned_to = body.assigned_to || null;
    }
    if (body.duplicate_of !== undefined) {
      allowedFields.duplicate_of = body.duplicate_of || null;
    }

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Nenhum campo para atualizar",
          },
        },
        { status: 400 }
      );
    }

    const { data: updated, error } = await supabase
      .from("bugs")
      .update(allowedFields)
      .eq("id", id)
      .select("id, number, status, assigned_to, version")
      .single();

    if (error) {
      console.error("Update bug error:", error);
      return NextResponse.json(
        {
          error: {
            code: "UPDATE_ERROR",
            message: "Erro ao atualizar bug",
          },
        },
        { status: 500 }
      );
    }

    // If actor is a team member, update audit log with correct actor
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (teamMember) {
      // Update the most recent audit entries for this bug that have null actor_id
      await supabase
        .from("bug_audit_log")
        .update({ actor_id: teamMember.id })
        .eq("bug_id", id)
        .is("actor_id", null)
        .gte("created_at", new Date(Date.now() - 5000).toISOString());
    }

    return NextResponse.json({ success: true, bug: updated });
  } catch (err) {
    console.error("Update bug error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      { status: 500 }
    );
  }
}

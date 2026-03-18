import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(
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

    if (!body.content?.trim()) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Conteudo obrigatorio",
          },
        },
        { status: 400 }
      );
    }

    // Get team member
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Voce nao e um membro da equipe",
          },
        },
        { status: 403 }
      );
    }

    const { data: note, error } = await supabase
      .from("bug_notes")
      .insert({
        bug_id: id,
        author_id: teamMember.id,
        content: body.content.trim(),
      })
      .select("*, author:team_members(id, name, email, avatar_url)")
      .single();

    if (error) {
      console.error("Insert note error:", error);
      return NextResponse.json(
        {
          error: {
            code: "INSERT_ERROR",
            message: "Erro ao adicionar nota",
          },
        },
        { status: 500 }
      );
    }

    // Add audit log entry
    await supabase.from("bug_audit_log").insert({
      bug_id: id,
      actor_id: teamMember.id,
      action: "note_added",
      new_value: body.content.trim().substring(0, 100),
    });

    return NextResponse.json({ success: true, note });
  } catch (err) {
    console.error("Add note error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      { status: 500 }
    );
  }
}

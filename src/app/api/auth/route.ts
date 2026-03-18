import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    if (!body.email || !body.password) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Email e senha obrigatorios",
          },
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: "AUTH_ERROR",
            message: "Email ou senha incorretos",
          },
        },
        { status: 401 }
      );
    }

    // Get team member info
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("*")
      .eq("auth_user_id", data.user.id)
      .single();

    return NextResponse.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: data.user.id,
        email: data.user.email,
        team_member: teamMember,
      },
    });
  } catch (err) {
    console.error("Auth error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      { status: 500 }
    );
  }
}

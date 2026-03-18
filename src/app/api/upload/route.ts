import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { isValidMimeType, MAX_FILE_SIZE, getClientIP } from "@/lib/utils";

// POST - Upload file to Supabase Storage
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectSlug = formData.get("project_slug") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: { code: "NO_FILE", message: "Nenhum arquivo enviado" } },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!isValidMimeType(file.type)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TYPE",
            message:
              "Formato nao suportado. Use MP4, MOV, WebM, JPG, PNG ou WebP",
          },
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: "Arquivo muito grande. O limite e 100MB",
          },
        },
        { status: 400 }
      );
    }

    // Generate storage path
    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || "bin";
    const safeName = file.name
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .substring(0, 50);
    const storagePath = `${projectSlug || "general"}/${timestamp}-${safeName}`;

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("bug-attachments")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        {
          error: {
            code: "UPLOAD_ERROR",
            message: "Erro no upload. Tente novamente.",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      file: {
        path: storagePath,
        name: file.name,
        type: file.type,
        size: file.size,
      },
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      { status: 500 }
    );
  }
}

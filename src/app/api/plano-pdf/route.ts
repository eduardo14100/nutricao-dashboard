import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";
import { getAuthedContext } from "@/lib/supabase";

const PDF_PATH = path.join(process.cwd(), "src", "data", "plano_nutricional.pdf");

export async function GET() {
  const ctx = await getAuthedContext();
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const fileBuffer = fs.readFileSync(PDF_PATH);
    const res = new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="plano_nutricional.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch {
    return NextResponse.json({ error: "PDF não encontrado." }, { status: 404 });
  }
}

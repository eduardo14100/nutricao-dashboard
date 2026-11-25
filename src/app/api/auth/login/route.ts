import { metric } from "@vercel/functions";
import { NextResponse } from "next/server";
import { attachSessionCookie, verifyPin } from "@/lib/auth";
import { signInOwnerSession } from "@/lib/supabase";

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const body = (await request.json()) as { pin?: string; remember?: boolean };
    const pin = String(body.pin ?? "").trim();
    const remember = body.remember !== false;

    if (!/^\d{4,6}$/.test(pin)) {
      metric("auth.login", 1, { outcome: "invalid_format" });
      return NextResponse.json({ error: "Informe um PIN numérico de 4 a 6 dígitos." }, { status: 400 });
    }

    const { supabase, session, userId } = await signInOwnerSession(remember);

    const { data: settings, error } = await supabase
      .from("user_settings")
      .select("pin_hash")
      .eq("user_id", userId)
      .single();

    if (error || !settings?.pin_hash) {
      metric("auth.login", 1, { outcome: "config_error" });
      return NextResponse.json({ error: "Falha ao verificar credenciais no banco." }, { status: 500 });
    }

    if (!verifyPin(pin, settings.pin_hash)) {
      metric("auth.login", 1, { outcome: "invalid_pin" });
      return NextResponse.json({ error: "PIN incorreto. Tente novamente." }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    attachSessionCookie(res, session);
    metric("auth.login", 1, { outcome: "success" });
    return res;
  } catch (err) {
    console.error("Login error:", err);
    metric("auth.login", 1, { outcome: "error" });
    return NextResponse.json({ error: "Erro interno ao autenticar." }, { status: 500 });
  } finally {
    metric("auth.login.duration_ms", performance.now() - startedAt);
  }
}

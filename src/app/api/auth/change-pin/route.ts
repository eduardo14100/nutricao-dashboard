import { metric } from "@vercel/functions";
import { NextResponse } from "next/server";
import { attachSessionCookie, hashPin, verifyPin } from "@/lib/auth";
import { getAuthedContext } from "@/lib/supabase";

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const ctx = await getAuthedContext();
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json()) as { currentPin?: string; newPin?: string };
    const currentPin = String(body.currentPin ?? "").trim();
    const newPin = String(body.newPin ?? "").trim();

    if (!/^\d{4,6}$/.test(newPin)) {
      return NextResponse.json({ error: "O novo PIN deve conter entre 4 e 6 dígitos numéricos." }, { status: 400 });
    }

    const { data: settings, error: readErr } = await ctx.supabase
      .from("user_settings")
      .select("pin_hash")
      .eq("user_id", ctx.userId)
      .single();

    if (readErr || !settings?.pin_hash) {
      metric("auth.pin_change", 1, { outcome: "error" });
      return NextResponse.json({ error: "Erro ao consultar PIN atual." }, { status: 500 });
    }

    if (!verifyPin(currentPin, settings.pin_hash)) {
      metric("auth.pin_change", 1, { outcome: "invalid_current_pin" });
      return NextResponse.json({ error: "PIN atual incorreto." }, { status: 403 });
    }

    const nextHash = hashPin(newPin);
    const { error: updateErr } = await ctx.supabase
      .from("user_settings")
      .update({ pin_hash: nextHash })
      .eq("user_id", ctx.userId);

    if (updateErr) {
      metric("auth.pin_change", 1, { outcome: "error" });
      return NextResponse.json({ error: "Não foi possível salvar o novo PIN." }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    metric("auth.pin_change", 1, { outcome: "success" });
    return res;
  } catch (err) {
    console.error("Change PIN error:", err);
    metric("auth.pin_change", 1, { outcome: "error" });
    return NextResponse.json({ error: "Erro interno ao alterar PIN." }, { status: 500 });
  } finally {
    metric("auth.pin_change.duration_ms", performance.now() - startedAt);
  }
}

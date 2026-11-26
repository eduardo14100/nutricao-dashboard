import { metric } from "@vercel/functions";
import { NextResponse } from "next/server";
import { attachSessionCookie, verifyPin } from "@/lib/auth";
import { checkGate, clientKey, lockedMessage, registerFailure, resetGate } from "@/lib/rate-limit";
import { getOwnerPinReader, invalidateOwnerPinReader, signInOwnerSession } from "@/lib/supabase";

function lockedResponse(until: Date) {
  const retryAfter = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { error: lockedMessage(until), lockedUntil: until.toISOString() },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

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

    // 1) Bloqueio por excesso de tentativas — antes de qualquer acesso ao Supabase Auth.
    const key = clientKey(request);
    const gate = await checkGate(key);
    if (gate.lockedUntil) {
      metric("auth.login", 1, { outcome: "locked" });
      return lockedResponse(gate.lockedUntil);
    }

    // 2) Confere o PIN com uma sessão de leitura reaproveitada (sem novo login no Supabase).
    let reader = await getOwnerPinReader();
    let { data: settings, error } = await reader.supabase
      .from("user_settings")
      .select("pin_hash")
      .eq("user_id", reader.userId)
      .single();

    if (error) {
      // token em cache pode ter sido revogado: renova uma vez e tenta de novo
      invalidateOwnerPinReader();
      reader = await getOwnerPinReader();
      ({ data: settings, error } = await reader.supabase
        .from("user_settings")
        .select("pin_hash")
        .eq("user_id", reader.userId)
        .single());
    }

    if (error || !settings?.pin_hash) {
      metric("auth.login", 1, { outcome: "config_error" });
      return NextResponse.json({ error: "Falha ao verificar credenciais no banco." }, { status: 500 });
    }

    if (!verifyPin(pin, settings.pin_hash)) {
      const after = await registerFailure(key);
      metric("auth.login", 1, { outcome: "invalid_pin" });
      if (after.lockedUntil) return lockedResponse(after.lockedUntil);
      return NextResponse.json({ error: "PIN incorreto. Tente novamente." }, { status: 401 });
    }

    // 3) PIN correto: só agora cria a sessão própria do usuário (cookie) e zera o contador.
    const { supabase, session } = await signInOwnerSession(remember);
    await resetGate(supabase, key);

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

import { metric } from "@vercel/functions";
import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";
import { getAuthedContext } from "@/lib/supabase";
import { DEFAULT_CHECKPOINTS } from "@/data/nutrition";

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = (await request.json()) as {
      recorded_date?: string;
      weight_kg?: number;
      source?: "manual" | "checkin" | "checkpoint";
      notes?: string | null;
    };

    if (!body.recorded_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.recorded_date)) {
      return NextResponse.json({ error: "Data de pesagem inválida." }, { status: 400 });
    }

    const weightKg = Number(Number(body.weight_kg).toFixed(2));
    if (Number.isNaN(weightKg) || weightKg < 35 || weightKg > 250) {
      return NextResponse.json({ error: "Peso deve estar entre 35 kg e 250 kg." }, { status: 400 });
    }

    const source = body.source === "checkpoint" || body.source === "checkin" ? body.source : "manual";

    const { data, error } = await ctx.supabase
      .from("weight_logs")
      .upsert(
        {
          user_id: ctx.userId,
          recorded_date: body.recorded_date,
          weight_kg: weightKg,
          source,
          is_projected: false,
          notes: (body.notes ?? "").trim() || "Pesagem registrada",
        },
        { onConflict: "user_id,recorded_date" }
      )
      .select("id, recorded_date, weight_kg, source, is_projected, notes")
      .single();

    if (error) {
      console.error("Weight upsert error:", error);
      metric("weight.saved", 1, { outcome: "error" });
      return NextResponse.json({ error: "Erro ao salvar pesagem." }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true, weightLog: data });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    metric("weight.saved", 1, { outcome: "success" });
    return res;
  } catch (err) {
    console.error("Weight POST error:", err);
    metric("weight.saved", 1, { outcome: "error" });
    return NextResponse.json({ error: "Erro interno ao salvar pesagem." }, { status: 500 });
  } finally {
    metric("weight.save.duration_ms", performance.now() - startedAt);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = (await request.json()) as { action?: string };
    if (body.action !== "reset") {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    await ctx.supabase.from("weight_logs").delete().eq("user_id", ctx.userId);
    const seedRows = DEFAULT_CHECKPOINTS.map((cp) => ({
      user_id: ctx.userId,
      ...cp,
    }));

    const [insertRes] = await Promise.all([
      ctx.supabase
        .from("weight_logs")
        .insert(seedRows)
        .select("id, recorded_date, weight_kg, source, is_projected, notes")
        .order("recorded_date", { ascending: true }),
      ctx.supabase.from("user_settings").update({ sim_deficit: 530 }).eq("user_id", ctx.userId),
    ]);

    if (insertRes.error) {
      return NextResponse.json({ error: "Erro ao restaurar projeção." }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true, weights: insertRes.data ?? [] });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch (err) {
    console.error("Weight reset error:", err);
    return NextResponse.json({ error: "Erro interno ao restaurar projeção." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Data inválida." }, { status: 400 });
    }

    const includeScale = searchParams.get("includeScale") === "1";

    const ops: PromiseLike<{ error: unknown }>[] = [
      ctx.supabase
        .from("weight_logs")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("recorded_date", date),
    ];

    if (includeScale) {
      ops.push(
        ctx.supabase
          .from("scale_measurements")
          .delete()
          .eq("user_id", ctx.userId)
          .eq("measured_date", date)
      );
    }

    const results = await Promise.all(ops);
    if (results.some((r) => r.error)) {
      return NextResponse.json({ error: "Erro ao remover pesagem." }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch (err) {
    console.error("Weight DELETE error:", err);
    return NextResponse.json({ error: "Erro interno ao remover pesagem." }, { status: 500 });
  }
}

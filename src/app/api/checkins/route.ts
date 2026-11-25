import { metric } from "@vercel/functions";
import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";
import { getAuthedContext } from "@/lib/supabase";
import {
  computeBalanceScore,
  computeDailyTotals,
  DEFAULT_SELECTED_MEALS,
  type OptionKey,
  type SelectedMeals,
} from "@/data/nutrition";

function sanitizeSelectedMeals(input: unknown): SelectedMeals {
  const validKeys: OptionKey[] = ["A", "B", "C"];
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const result: SelectedMeals = { ...DEFAULT_SELECTED_MEALS };
  (["1", "2", "3", "4", "5"] as const).forEach((k) => {
    const v = obj[k];
    if (typeof v === "string" && validKeys.includes(v as OptionKey)) {
      result[k] = v as OptionKey;
    }
  });
  return result;
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = (await request.json()) as {
      log_date?: string;
      weight_kg?: number | null;
      water_ml?: number;
      selected_options?: SelectedMeals;
      hunger_score?: number | null;
      hunger_label?: string | null;
      training_energy_score?: number | null;
      training_energy_label?: string | null;
      sleep_digestion?: string | null;
      notes?: string | null;
    };

    if (!body.log_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.log_date)) {
      return NextResponse.json({ error: "Data de check-in inválida." }, { status: 400 });
    }

    const selected = sanitizeSelectedMeals(body.selected_options);
    const waterMl = Math.max(0, Math.min(10000, Math.round(Number(body.water_ml ?? 0))));
    const weightVal =
      body.weight_kg !== null && body.weight_kg !== undefined && !Number.isNaN(Number(body.weight_kg))
        ? Number(Number(body.weight_kg).toFixed(2))
        : null;

    if (weightVal !== null && (weightVal < 35 || weightVal > 250)) {
      return NextResponse.json({ error: "Peso deve estar entre 35 kg e 250 kg." }, { status: 400 });
    }

    const totals = computeDailyTotals(selected);
    const balanceScore = computeBalanceScore(totals, { kcal: 2000, p: 178, c: 195, f: 60 });

    const dailyPayload = {
      user_id: ctx.userId,
      log_date: body.log_date,
      selected_options: selected,
      water_ml: waterMl,
      weight_kg: weightVal,
      hunger_score: body.hunger_score ?? null,
      hunger_label: body.hunger_label ?? null,
      training_energy_score: body.training_energy_score ?? null,
      training_energy_label: body.training_energy_label ?? null,
      sleep_digestion: body.sleep_digestion ?? null,
      notes: (body.notes ?? "").trim() || null,
      total_kcal: Number(totals.kcal.toFixed(1)),
      total_protein_g: Number(totals.p.toFixed(1)),
      total_carbs_g: Number(totals.c.toFixed(1)),
      total_fat_g: Number(totals.f.toFixed(1)),
      total_fiber_g: Number(totals.fib.toFixed(1)),
      balance_score: balanceScore,
      checkin_submitted: true,
    };

    const ops: PromiseLike<unknown>[] = [
      ctx.supabase
        .from("daily_logs")
        .upsert(dailyPayload, { onConflict: "user_id,log_date" })
        .select()
        .single(),
    ];

    if (weightVal !== null) {
      ops.push(
        ctx.supabase
          .from("weight_logs")
          .upsert(
            {
              user_id: ctx.userId,
              recorded_date: body.log_date,
              weight_kg: weightVal,
              source: "checkin",
              is_projected: false,
              notes: "Registrado via check-in diário",
            },
            { onConflict: "user_id,recorded_date" }
          )
          .select()
          .single()
      );
    }

    const [dailyResult, weightResult] = (await Promise.all(ops)) as [
      { data: unknown; error: unknown },
      { data: unknown; error: unknown } | undefined,
    ];

    if (dailyResult.error || weightResult?.error) {
      console.error("Check-in save error:", { daily: dailyResult.error, weight: weightResult?.error });
      metric("checkin.saved", 1, { outcome: "error" });
      return NextResponse.json({ error: "Erro ao salvar check-in no banco." }, { status: 500 });
    }

    const res = NextResponse.json({
      ok: true,
      dailyLog: dailyResult.data,
      weightLog: weightResult?.data ?? null,
    });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    metric("checkin.saved", 1, { outcome: "success" });
    return res;
  } catch (err) {
    console.error("Check-in POST error:", err);
    metric("checkin.saved", 1, { outcome: "error" });
    return NextResponse.json({ error: "Erro interno ao salvar check-in." }, { status: 500 });
  } finally {
    metric("checkin.save.duration_ms", performance.now() - startedAt);
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

    const { error } = await ctx.supabase
      .from("daily_logs")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("log_date", date);

    if (error) {
      return NextResponse.json({ error: "Erro ao remover check-in." }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch (err) {
    console.error("Check-in DELETE error:", err);
    return NextResponse.json({ error: "Erro interno ao remover check-in." }, { status: 500 });
  }
}

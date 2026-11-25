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

export async function PUT(request: Request) {
  const startedAt = performance.now();
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = (await request.json()) as {
      log_date?: string;
      selected_options?: SelectedMeals;
      water_ml?: number;
    };

    if (!body.log_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.log_date)) {
      return NextResponse.json({ error: "Data inválida." }, { status: 400 });
    }

    const selected = sanitizeSelectedMeals(body.selected_options);
    const waterMl = Math.max(0, Math.min(10000, Math.round(Number(body.water_ml ?? 0))));
    const totals = computeDailyTotals(selected);
    const balanceScore = computeBalanceScore(totals, { kcal: 2000, p: 178, c: 195, f: 60 });

    // Check if row exists to avoid overwriting check-in fields
    const { data: existing } = await ctx.supabase
      .from("daily_logs")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("log_date", body.log_date)
      .maybeSingle();

    const payload = {
      selected_options: selected,
      water_ml: waterMl,
      total_kcal: Number(totals.kcal.toFixed(1)),
      total_protein_g: Number(totals.p.toFixed(1)),
      total_carbs_g: Number(totals.c.toFixed(1)),
      total_fat_g: Number(totals.f.toFixed(1)),
      total_fiber_g: Number(totals.fib.toFixed(1)),
      balance_score: balanceScore,
    };

    const query = existing
      ? ctx.supabase
          .from("daily_logs")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single()
      : ctx.supabase
          .from("daily_logs")
          .insert({
            user_id: ctx.userId,
            log_date: body.log_date,
            ...payload,
          })
          .select()
          .single();

    const { data, error } = await query;
    if (error) {
      console.error("day-state save error:", error);
      metric("day_state.saved", 1, { outcome: "error" });
      return NextResponse.json({ error: "Erro ao salvar estado do dia." }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true, dailyLog: data });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    metric("day_state.saved", 1, { outcome: "success" });
    return res;
  } catch (err) {
    console.error("day-state PUT error:", err);
    metric("day_state.saved", 1, { outcome: "error" });
    return NextResponse.json({ error: "Erro interno ao salvar estado do dia." }, { status: 500 });
  } finally {
    metric("day_state.duration_ms", performance.now() - startedAt);
  }
}

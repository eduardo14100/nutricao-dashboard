import { metric } from "@vercel/functions";
import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";
import { getAuthedContext } from "@/lib/supabase";
import { DEFAULT_SELECTED_MEALS, getTodayBrazilISO } from "@/data/nutrition";

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const ctx = await getAuthedContext();
    if (!ctx) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedDate = searchParams.get("date");
    const activeDate =
      requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
        ? requestedDate
        : getTodayBrazilISO();

    const [settingsRes, weightsRes, dailyRes, scaleRes, cyclesRes] = await Promise.all([
      ctx.supabase
        .from("user_settings")
        .select(
          "sim_deficit, tmb_kcal, get_kcal, calorie_goal, protein_goal, carb_goal, fat_goal, fiber_goal, sodium_limit, water_goal_ml, start_weight_kg, target_weight_min_kg, target_weight_max_kg, protocol_start_date, protocol_end_date, height_cm, age_years, sex, scale_user_id"
        )
        .eq("user_id", ctx.userId)
        .single(),
      ctx.supabase
        .from("weight_logs")
        .select("id, recorded_date, weight_kg, source, is_projected, notes")
        .eq("user_id", ctx.userId)
        .order("recorded_date", { ascending: true }),
      ctx.supabase
        .from("daily_logs")
        .select(
          "id, log_date, selected_options, water_ml, weight_kg, hunger_score, hunger_label, training_energy_score, training_energy_label, sleep_digestion, notes, total_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g, balance_score, checkin_submitted, updated_at"
        )
        .eq("user_id", ctx.userId)
        .order("log_date", { ascending: false })
        .limit(90),
      ctx.supabase
        .from("scale_measurements")
        .select(
          "id, measured_at, measured_date, weight_kg, impedance_ohm, bmi, body_fat_pct, fat_mass_kg, muscle_kg, water_pct, bone_kg, visceral_fat, source"
        )
        .eq("user_id", ctx.userId)
        .order("measured_at", { ascending: false })
        .limit(365),
      ctx.supabase
        .from("protocol_cycles")
        .select(
          "id, name, start_date, end_date, start_weight_kg, target_weight_min_kg, target_weight_max_kg, sim_deficit, final_weight_kg, is_active, notes, created_at"
        )
        .eq("user_id", ctx.userId)
        .order("start_date", { ascending: false }),
    ]);

    if (settingsRes.error || weightsRes.error || dailyRes.error || scaleRes.error) {
      console.error("Dashboard load errors:", {
        settings: settingsRes.error,
        weights: weightsRes.error,
        daily: dailyRes.error,
        scale: scaleRes.error,
      });
      metric("dashboard.load", 1, { outcome: "error" });
      return NextResponse.json({ error: "Erro ao carregar dados do Supabase." }, { status: 500 });
    }

    const dailyLogs = dailyRes.data ?? [];
    const todayLog =
      dailyLogs.find((row) => row.log_date === activeDate) ?? {
        log_date: activeDate,
        selected_options: DEFAULT_SELECTED_MEALS,
        water_ml: 0,
        weight_kg: null,
        hunger_score: 3,
        hunger_label: "3/10 — Fome leve normal antes das refeições",
        training_energy_score: 8,
        training_energy_label: "8/10 — Boa energia e disposição",
        sleep_digestion: "Sono bom, digestão leve e intestino regular",
        notes: "",
        total_kcal: null,
        total_protein_g: null,
        total_carbs_g: null,
        total_fat_g: null,
        total_fiber_g: null,
        balance_score: null,
        checkin_submitted: false,
      };

    const res = NextResponse.json({
      authenticated: true,
      activeDate,
      settings: settingsRes.data,
      weights: weightsRes.data ?? [],
      dailyLogs,
      todayLog,
      scaleMeasurements: scaleRes.data ?? [],
      cycles: cyclesRes.error ? [] : (cyclesRes.data ?? []),
      cyclesHistoryAvailable: !cyclesRes.error,
    });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    metric("dashboard.load", 1, { outcome: "success" });
    return res;
  } catch (err) {
    console.error("Dashboard GET error:", err);
    metric("dashboard.load", 1, { outcome: "error" });
    return NextResponse.json({ error: "Erro interno ao carregar painel." }, { status: 500 });
  } finally {
    metric("dashboard.load.duration_ms", performance.now() - startedAt);
  }
}

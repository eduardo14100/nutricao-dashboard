import PinLockScreen from "@/components/PinLockScreen";
import NutritionDashboard from "@/components/NutritionDashboard";
import { getAuthedContext } from "@/lib/supabase";
import {
  DEFAULT_SELECTED_MEALS,
  getTodayBrazilISO,
  type DailyLogDTO,
  type UserSettingsDTO,
  type WeightLogDTO,
} from "@/data/nutrition";
import type { ScaleMeasurementDTO } from "@/data/scale";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await getAuthedContext();

  // Strictly block all diet data on the server until PIN cookie is verified
  if (!ctx) {
    return <PinLockScreen />;
  }

  const activeDate = getTodayBrazilISO();

  const [settingsRes, weightsRes, dailyRes, scaleRes] = await Promise.all([
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
  ]);

  if (settingsRes.error || !settingsRes.data) {
    return <PinLockScreen />;
  }

  const dailyLogs = (dailyRes.data ?? []) as DailyLogDTO[];
  const todayLog: DailyLogDTO =
    dailyLogs.find((r) => r.log_date === activeDate) ?? {
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

  return (
    <NutritionDashboard
      initialActiveDate={activeDate}
      initialSettings={settingsRes.data as UserSettingsDTO}
      initialWeights={(weightsRes.data ?? []) as WeightLogDTO[]}
      initialDailyLogs={dailyLogs}
      initialTodayLog={todayLog}
      initialScaleMeasurements={(scaleRes.data ?? []) as ScaleMeasurementDTO[]}
    />
  );
}

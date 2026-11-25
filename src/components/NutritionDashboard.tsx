"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calcItemMacros,
  calcMealMacros,
  computeBalanceScore,
  computeDailyTotals,
  DEFAULT_SELECTED_MEALS,
  formatFullDateBR,
  MEALS_DATA,
  TACO_FOODS,
  type DailyLogDTO,
  type OptionKey,
  type SelectedMeals,
  type UserSettingsDTO,
  type WeightLogDTO,
} from "@/data/nutrition";
import { buildProjectedVsRealizedSeries, type ScaleMeasurementDTO } from "@/data/scale";
import ChangePinModal from "./ChangePinModal";
import WeightChartCard from "./WeightChartCard";
import TacoSwapCalculator from "./TacoSwapCalculator";
import CheckinHistorySection from "./CheckinHistorySection";

interface NutritionDashboardProps {
  initialActiveDate: string;
  initialSettings: UserSettingsDTO;
  initialWeights: WeightLogDTO[];
  initialDailyLogs: DailyLogDTO[];
  initialTodayLog: DailyLogDTO;
  initialScaleMeasurements: ScaleMeasurementDTO[];
}

export default function NutritionDashboard({
  initialActiveDate,
  initialSettings,
  initialWeights,
  initialDailyLogs,
  initialTodayLog,
  initialScaleMeasurements,
}: NutritionDashboardProps) {
  const router = useRouter();
  const [activeDate, setActiveDate] = useState<string>(initialActiveDate);
  const [settings, setSettings] = useState<UserSettingsDTO>(initialSettings);
  const [simDeficit, setSimDeficit] = useState<number>(initialSettings.sim_deficit);
  const [weights, setWeights] = useState<WeightLogDTO[]>(initialWeights);
  const [scaleMeasurements, setScaleMeasurements] =
    useState<ScaleMeasurementDTO[]>(initialScaleMeasurements);
  const [dailyLogs, setDailyLogs] = useState<DailyLogDTO[]>(initialDailyLogs);

  const [selectedOptions, setSelectedOptions] = useState<SelectedMeals>(
    initialTodayLog.selected_options ?? DEFAULT_SELECTED_MEALS
  );
  const [waterMl, setWaterMl] = useState<number>(initialTodayLog.water_ml ?? 0);

  const [syncState, setSyncState] = useState<"saved" | "saving" | "error">("saved");
  const [pinModalOpen, setPinModalOpen] = useState(false);

  const deficitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistDayState = useCallback(
    async (date: string, nextMeals: SelectedMeals, nextWater: number) => {
      setSyncState("saving");
      try {
        const res = await fetch("/api/day-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            log_date: date,
            selected_options: nextMeals,
            water_ml: nextWater,
          }),
        });
        if (!res.ok) {
          setSyncState("error");
          return;
        }
        const data = (await res.json()) as { dailyLog?: DailyLogDTO };
        if (data.dailyLog) {
          setDailyLogs((prev) => {
            const exists = prev.some((r) => r.log_date === data.dailyLog!.log_date);
            const next = exists
              ? prev.map((r) => (r.log_date === data.dailyLog!.log_date ? data.dailyLog! : r))
              : [data.dailyLog!, ...prev];
            return next.sort((a, b) => b.log_date.localeCompare(a.log_date));
          });
        }
        setSyncState("saved");
      } catch {
        setSyncState("error");
      }
    },
    []
  );

  const handleSelectActiveDate = (nextDate: string) => {
    setActiveDate(nextDate);
    const existing = dailyLogs.find((r) => r.log_date === nextDate);
    if (existing) {
      setSelectedOptions(existing.selected_options ?? DEFAULT_SELECTED_MEALS);
      setWaterMl(existing.water_ml ?? 0);
    } else {
      setSelectedOptions(DEFAULT_SELECTED_MEALS);
      setWaterMl(0);
    }
  };

  const handleSelectMealOption = (mealId: 1 | 2 | 3 | 4 | 5, optKey: OptionKey) => {
    const next = { ...selectedOptions, [String(mealId)]: optKey } as SelectedMeals;
    setSelectedOptions(next);
    void persistDayState(activeDate, next, waterMl);
  };

  const handleResetPlan = (planKey: OptionKey) => {
    const next: SelectedMeals = {
      "1": planKey,
      "2": planKey,
      "3": planKey,
      "4": planKey,
      "5": planKey,
    };
    setSelectedOptions(next);
    void persistDayState(activeDate, next, waterMl);
  };

  const handleAddWater = (delta: number) => {
    const nextWater = Math.max(0, Math.min(6000, waterMl + delta));
    setWaterMl(nextWater);
    void persistDayState(activeDate, selectedOptions, nextWater);
  };

  const handleDeficitChange = (nextDeficit: number) => {
    setSimDeficit(nextDeficit);
    if (deficitTimerRef.current) clearTimeout(deficitTimerRef.current);
    deficitTimerRef.current = setTimeout(async () => {
      setSyncState("saving");
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sim_deficit: nextDeficit }),
        });
        if (res.ok) {
          const data = (await res.json()) as { settings?: UserSettingsDTO };
          if (data.settings) setSettings(data.settings);
          setSyncState("saved");
        } else {
          setSyncState("error");
        }
      } catch {
        setSyncState("error");
      }
    }, 500);
  };

  const handleSaveBodyProfile = async (profile: {
    height_cm: number;
    age_years: number;
    sex: 0 | 1;
    scale_user_id?: number;
  }) => {
    setSyncState("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        const data = (await res.json()) as { settings?: UserSettingsDTO };
        if (data.settings) setSettings(data.settings);
        setSyncState("saved");
      } else {
        setSyncState("error");
      }
    } catch {
      setSyncState("error");
    }
  };

  const handleSyncScaleMeasurements = async (
    measurements: Array<{
      measured_at: string;
      weight_kg: number;
      impedance_ohm: number | null;
      source: "ble-live" | "ble-history" | "manual";
    }>
  ): Promise<number> => {
    setSyncState("saving");
    try {
      const res = await fetch("/api/scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurements }),
      });
      if (!res.ok) {
        setSyncState("error");
        return 0;
      }
      const data = (await res.json()) as {
        insertedCount?: number;
        scaleMeasurements?: ScaleMeasurementDTO[];
        weights?: WeightLogDTO[];
      };
      if (data.scaleMeasurements) setScaleMeasurements(data.scaleMeasurements);
      if (data.weights) setWeights(data.weights);
      setSyncState("saved");
      return data.insertedCount ?? 0;
    } catch {
      setSyncState("error");
      return 0;
    }
  };

  const handleDeleteScaleMeasurement = async (id: number) => {
    setSyncState("saving");
    try {
      const res = await fetch(`/api/scale?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        const data = (await res.json()) as {
          scaleMeasurements?: ScaleMeasurementDTO[];
          weights?: WeightLogDTO[];
        };
        if (data.scaleMeasurements) setScaleMeasurements(data.scaleMeasurements);
        if (data.weights) setWeights(data.weights);
        setSyncState("saved");
      } else {
        setSyncState("error");
      }
    } catch {
      setSyncState("error");
    }
  };

  const handleSaveWeight = async (recordedDate: string, weightKg: number, notes?: string) => {
    setSyncState("saving");
    const res = await fetch("/api/weights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recorded_date: recordedDate, weight_kg: weightKg, notes }),
    });
    if (!res.ok) {
      setSyncState("error");
      return;
    }
    const data = (await res.json()) as { weightLog?: WeightLogDTO };
    if (data.weightLog) {
      setWeights((prev) => {
        const exists = prev.some((w) => w.recorded_date === data.weightLog!.recorded_date);
        const next = exists
          ? prev.map((w) => (w.recorded_date === data.weightLog!.recorded_date ? data.weightLog! : w))
          : [...prev, data.weightLog!];
        return next.sort((a, b) => a.recorded_date.localeCompare(b.recorded_date));
      });
    }
    setSyncState("saved");
  };

  const handleDeleteWeight = async (recordedDate: string) => {
    setSyncState("saving");
    const res = await fetch(
      `/api/weights?date=${encodeURIComponent(recordedDate)}&includeScale=1`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setWeights((prev) => prev.filter((w) => w.recorded_date !== recordedDate));
      setScaleMeasurements((prev) => prev.filter((m) => m.measured_date !== recordedDate));
      setSyncState("saved");
    } else {
      setSyncState("error");
    }
  };

  const handleResetWeights = async () => {
    setSyncState("saving");
    const res = await fetch("/api/weights", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    if (res.ok) {
      const data = (await res.json()) as { weights?: WeightLogDTO[] };
      if (data.weights) setWeights(data.weights);
      setSimDeficit(530);
      setSyncState("saved");
    } else {
      setSyncState("error");
    }
  };

  const handleSaveCheckin = async (payload: {
    log_date: string;
    weight_kg: number | null;
    water_ml: number;
    selected_options: SelectedMeals;
    hunger_score: number;
    hunger_label: string;
    training_energy_score: number;
    training_energy_label: string;
    sleep_digestion: string;
    notes: string;
  }) => {
    setSyncState("saving");
    const res = await fetch("/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setSyncState("error");
      return;
    }
    const data = (await res.json()) as { dailyLog?: DailyLogDTO; weightLog?: WeightLogDTO | null };
    if (data.dailyLog) {
      setDailyLogs((prev) => {
        const exists = prev.some((r) => r.log_date === data.dailyLog!.log_date);
        const next = exists
          ? prev.map((r) => (r.log_date === data.dailyLog!.log_date ? data.dailyLog! : r))
          : [data.dailyLog!, ...prev];
        return next.sort((a, b) => b.log_date.localeCompare(a.log_date));
      });
    }
    if (data.weightLog) {
      setWeights((prev) => {
        const exists = prev.some((w) => w.recorded_date === data.weightLog!.recorded_date);
        const next = exists
          ? prev.map((w) => (w.recorded_date === data.weightLog!.recorded_date ? data.weightLog! : w))
          : [...prev, data.weightLog!];
        return next.sort((a, b) => a.recorded_date.localeCompare(b.recorded_date));
      });
    }
    setSyncState("saved");
  };

  const handleDeleteCheckin = async (logDate: string) => {
    setSyncState("saving");
    const res = await fetch(`/api/checkins?date=${encodeURIComponent(logDate)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setDailyLogs((prev) => prev.filter((r) => r.log_date !== logDate));
      setSyncState("saved");
    } else {
      setSyncState("error");
    }
  };

  const handleLock = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  };

  const totals = useMemo(() => computeDailyTotals(selectedOptions), [selectedOptions]);
  const balanceScore = useMemo(
    () =>
      computeBalanceScore(totals, {
        kcal: settings.calorie_goal,
        p: Number(settings.protein_goal),
        c: Number(settings.carb_goal),
        f: Number(settings.fat_goal),
      }),
    [totals, settings]
  );

  const pvrSummary = useMemo(
    () =>
      buildProjectedVsRealizedSeries({
        weights,
        scaleMeasurements,
        simDeficit,
        settings,
      }),
    [weights, scaleMeasurements, simDeficit, settings]
  );
  const latestReal = pvrSummary.latestRealized;

  const gpMetrics = useMemo(
    () => [
      {
        key: "kcal",
        label: "🔥 Calorias (Orçamento Cutting)",
        actual: totals.kcal,
        goal: settings.calorie_goal,
        unit: "kcal",
        kind: "budget" as const,
      },
      {
        key: "p",
        label: "🥩 Proteínas (~2,05 g/kg)",
        actual: totals.p,
        goal: Number(settings.protein_goal),
        unit: "g",
        kind: "target" as const,
      },
      {
        key: "c",
        label: "🍞 Carboidratos (Energia Treino)",
        actual: totals.c,
        goal: Number(settings.carb_goal),
        unit: "g",
        kind: "target" as const,
      },
      {
        key: "f",
        label: "🥑 Gorduras Totais (~0,68 g/kg)",
        actual: totals.f,
        goal: Number(settings.fat_goal),
        unit: "g",
        kind: "target" as const,
      },
      {
        key: "fib",
        label: "🌾 Fibras Alimentares (Saciedade)",
        actual: totals.fib,
        goal: Number(settings.fiber_goal),
        unit: "g",
        kind: "target" as const,
      },
      {
        key: "na",
        label: "🧂 Sódio Intrínseco (+ sal moderado)",
        actual: totals.na,
        goal: Number(settings.sodium_limit),
        unit: "mg",
        kind: "limit" as const,
      },
      {
        key: "water",
        label: "💧 Água / Hidratação",
        actual: waterMl,
        goal: settings.water_goal_ml,
        unit: "ml",
        kind: "target" as const,
      },
    ],
    [totals, settings, waterMl]
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <header className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              <span>Protocolo Cutting • 53 Dias (08/11 a 31/12/2026)</span>
              <span
                className={`normal-case px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  syncState === "saving"
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : syncState === "error"
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                }`}
              >
                {syncState === "saving"
                  ? "⏳ Salvando no Supabase..."
                  : syncState === "error"
                    ? "⚠️ Erro de sincronização"
                    : "☁️ Sincronizado com Supabase"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] mt-1">
              Painel de Acompanhamento Nutricional
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              Perfil: Homem, {settings.age_years ?? 33} anos, {((settings.height_cm ?? 181) / 100).toFixed(2).replace(".", ",")} m, 87,0 kg • Musculação 4x/sem • 5 Refeições/dia
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--background)] border border-[var(--border)] text-slate-200">
              <span>📅 Dia:</span>
              <input
                type="date"
                value={activeDate}
                onChange={(e) => {
                  if (e.target.value) handleSelectActiveDate(e.target.value);
                }}
                className="bg-transparent text-emerald-400 font-semibold focus:outline-none"
              />
            </label>
            <a
              href="/api/plano-pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-[var(--border)] hover:bg-slate-700 transition"
              title="Abrir Plano Nutricional em PDF"
            >
              📄 Plano PDF
            </a>
            <button
              type="button"
              onClick={() => void handleLock()}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-[var(--border)] hover:bg-slate-700 transition cursor-pointer"
              title="Bloquear tela com PIN"
            >
              🔒 Bloquear
            </button>
            <button
              type="button"
              onClick={() => setPinModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-[var(--border)] hover:bg-slate-700 transition cursor-pointer"
              title="Alterar PIN"
            >
              ⚙️ Alterar PIN
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
          <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <div className="text-xs text-[var(--muted-foreground)]">TMB (Basal)</div>
            <div className="text-lg font-bold mt-0.5">
              {settings.tmb_kcal.toLocaleString("pt-BR")} kcal
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">Mifflin-St Jeor (~1.800 kcal)</div>
          </div>
          <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <div className="text-xs text-[var(--muted-foreground)]">GET (Manutenção)</div>
            <div className="text-lg font-bold mt-0.5">
              {settings.get_kcal.toLocaleString("pt-BR")} kcal
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">Fator 1,375 (Treino 4x/sem)</div>
          </div>
          <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <div className="text-xs text-[var(--muted-foreground)]">Meta Diária (Cutting)</div>
            <div className="text-lg font-bold text-emerald-500 mt-0.5">
              {settings.calorie_goal.toLocaleString("pt-BR")} kcal
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">Déficit de ~{simDeficit} kcal/dia</div>
          </div>
          <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <div className="text-xs text-[var(--muted-foreground)]">
              {latestReal ? `Realizado (${latestReal.label}) vs Proj.` : "Meta de Peso (31/12)"}
            </div>
            <div className="text-lg font-bold mt-0.5 flex items-baseline gap-1.5">
              <span>{latestReal ? `${latestReal.realizedKg.toFixed(1)} kg` : "83,4 kg"}</span>
              {latestReal ? (
                <span
                  className={`text-xs font-semibold ${
                    latestReal.deltaKg <= 0 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  ({latestReal.deltaKg <= 0 ? "" : "+"}
                  {latestReal.deltaKg.toFixed(1)})
                </span>
              ) : null}
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">
              Proj. hoje: {pvrSummary.projectedTodayKg.toFixed(1)} kg • Alvo:{" "}
              {Number(settings.target_weight_min_kg).toFixed(0)}–{Number(settings.target_weight_max_kg).toFixed(0)} kg
            </div>
          </div>
          <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <div className="text-xs text-[var(--muted-foreground)]">Score de Balanço</div>
            <div className="text-lg font-bold text-emerald-500 mt-0.5">{balanceScore}/100</div>
            <div className="text-xs text-[var(--muted-foreground)]">
              {balanceScore >= 90 ? "Excelente (food-nutrition)" : "Bom Equilíbrio"}
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid: GP_METRICS + Projected vs Realized Chart & Xiaomi Scale */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Metas Diárias &amp; Progresso ({formatFullDateBR(activeDate)})
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Calculado em tempo real e salvo automaticamente no Supabase
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleResetPlan("A")}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-90 cursor-pointer"
            >
              Restaurar Plano Base (A)
            </button>
          </div>

          <div className="space-y-3">
            {gpMetrics.map((m) => {
              const pct = Math.min(100, Math.round((m.actual / m.goal) * 100));
              let barColor = "bg-emerald-500";
              let statusEl = null;

              if (m.kind === "budget") {
                const diff = m.goal - m.actual;
                if (Math.abs(diff) <= 60) {
                  statusEl = (
                    <span className="text-emerald-500 font-medium">
                      No Alvo ({diff >= 0 ? `-${diff.toFixed(0)}` : `+${Math.abs(diff).toFixed(0)}`} kcal)
                    </span>
                  );
                } else if (diff < -60) {
                  barColor = "bg-amber-500";
                  statusEl = (
                    <span className="text-amber-500 font-medium">Acima (+{Math.abs(diff).toFixed(0)} kcal)</span>
                  );
                } else {
                  statusEl = <span className="text-sky-500 font-medium">Abaixo (-{diff.toFixed(0)} kcal)</span>;
                }
              } else if (m.kind === "limit") {
                if (m.actual <= m.goal * 0.9) {
                  statusEl = (
                    <span className="text-emerald-500 font-medium">
                      Controlado ({(m.goal - m.actual).toFixed(0)} {m.unit} abaixo)
                    </span>
                  );
                } else {
                  barColor = "bg-amber-500";
                  statusEl = <span className="text-amber-500 font-medium">Próximo ao limite</span>;
                }
              } else {
                if (m.actual >= m.goal * 0.92) {
                  statusEl = <span className="text-emerald-500 font-medium">Meta Atingida ({pct}%)</span>;
                } else {
                  barColor = "bg-sky-500";
                  statusEl = (
                    <span className="text-amber-500 font-medium">
                      Faltam {(m.goal - m.actual).toFixed(0)} {m.unit}
                    </span>
                  );
                }
              }

              return (
                <div key={m.key} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[var(--foreground)]">{m.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--foreground)]">
                        {m.actual.toFixed(m.unit === "g" ? 1 : 0)} / {m.goal} {m.unit}
                      </span>
                      {statusEl}
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--background)] border border-[var(--border)] overflow-hidden">
                    <div className={`h-full ${barColor} transition-all duration-300`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm font-medium">
                💧 Hidratação Diária (Meta: {settings.water_goal_ml.toLocaleString("pt-BR")} ml — 35 ml/kg)
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                Atual em {formatFullDateBR(activeDate)}:{" "}
                <span className="font-semibold text-[var(--foreground)]">{waterMl.toLocaleString("pt-BR")}</span> ml registrados
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddWater(-250)}
                className="px-2.5 py-1 text-xs rounded border border-[var(--border)] bg-[var(--background)] hover:opacity-80 cursor-pointer"
              >
                -250 ml
              </button>
              <button
                type="button"
                onClick={() => handleAddWater(250)}
                className="px-2.5 py-1 text-xs rounded border border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-80 cursor-pointer"
              >
                +250 ml
              </button>
              <button
                type="button"
                onClick={() => handleAddWater(500)}
                className="px-2.5 py-1 text-xs rounded bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 cursor-pointer"
              >
                +500 ml
              </button>
            </div>
          </div>
        </div>

        <WeightChartCard
          weights={weights}
          scaleMeasurements={scaleMeasurements}
          settings={settings}
          simDeficit={simDeficit}
          onDeficitChange={handleDeficitChange}
          onSaveWeight={handleSaveWeight}
          onDeleteWeight={handleDeleteWeight}
          onResetWeights={handleResetWeights}
          onSyncScaleMeasurements={handleSyncScaleMeasurements}
          onDeleteScaleMeasurement={handleDeleteScaleMeasurement}
          onSaveBodyProfile={handleSaveBodyProfile}
        />
      </div>

      {/* 5 Meals Interactive Selector */}
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Cardápio Interativo — 5 Refeições Diárias (Dados Oficiais TACO)
            </h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Alterne entre as Opções A, B ou C em cada refeição — sua escolha do dia fica salva na nuvem.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleResetPlan("A")}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--background)] hover:opacity-80 cursor-pointer"
            >
              Todo Plano A
            </button>
            <button
              type="button"
              onClick={() => handleResetPlan("B")}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--background)] hover:opacity-80 cursor-pointer"
            >
              Todo Plano B
            </button>
            <button
              type="button"
              onClick={() => handleResetPlan("C")}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--background)] hover:opacity-80 cursor-pointer"
            >
              Todo Plano C
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {MEALS_DATA.map((meal) => {
            const activeKey = selectedOptions[String(meal.id) as keyof SelectedMeals] ?? "A";
            const activeOpt = meal.options[activeKey];
            const mTotal = calcMealMacros(meal, activeKey);

            return (
              <div
                key={meal.id}
                className="p-4 rounded-xl border border-[var(--border)] bg-[var(--background)] flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--secondary)] text-[var(--secondary-foreground)]">
                      {meal.time}
                    </span>
                    <div className="flex gap-1">
                      {(["A", "B", "C"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => handleSelectMealOption(meal.id, k)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                            activeKey === k
                              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                              : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] hover:text-white"
                          }`}
                        >
                          Opção {k}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--foreground)]">{meal.title}</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">{activeOpt.label}</p>
                  </div>
                  <ul className="divide-y divide-[var(--border)]">
                    {activeOpt.items.map((it, idx) => {
                      const f = TACO_FOODS[String(it.food_id)];
                      const m = calcItemMacros(it.food_id, it.grams);
                      return (
                        <li
                          key={`${it.food_id}-${idx}`}
                          className="flex items-start justify-between gap-2 text-xs py-1.5"
                        >
                          <div>
                            <span className="font-medium text-[var(--foreground)]">
                              {f?.name ?? `TACO #${it.food_id}`}
                            </span>
                            <span className="text-[var(--muted-foreground)] block">
                              TACO #{it.food_id} • {it.grams}g ({it.note})
                            </span>
                          </div>
                          <div className="text-right whitespace-nowrap text-[var(--muted-foreground)]">
                            <span className="font-semibold text-[var(--foreground)]">
                              {m.kcal.toFixed(0)} kcal
                            </span>
                            <br />
                            P:{m.p.toFixed(1)}g C:{m.c.toFixed(1)}g G:{m.f.toFixed(1)}g
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--foreground)]">
                    Total: {mTotal.kcal.toFixed(0)} kcal
                  </span>
                  <span className="text-[var(--muted-foreground)]">
                    P: <b>{mTotal.p.toFixed(1)}g</b> • C: <b>{mTotal.c.toFixed(1)}g</b> • G:{" "}
                    <b>{mTotal.f.toFixed(1)}g</b> • Fib: <b>{mTotal.fib.toFixed(1)}g</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* TACO Calculator (with Fuzzy Search) */}
      <TacoSwapCalculator />

      {/* Daily Check-in + History */}
      <CheckinHistorySection
        activeDate={activeDate}
        selectedOptions={selectedOptions}
        waterMl={waterMl}
        dailyLogs={dailyLogs}
        initialWeightKg={
          latestReal ? latestReal.realizedKg : Number(settings.start_weight_kg)
        }
        onSelectActiveDate={handleSelectActiveDate}
        onSaveCheckin={handleSaveCheckin}
        onDeleteCheckin={handleDeleteCheckin}
      />

      <ChangePinModal open={pinModalOpen} onClose={() => setPinModalOpen(false)} />
    </div>
  );
}

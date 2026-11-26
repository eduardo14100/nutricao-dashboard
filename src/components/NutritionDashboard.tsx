"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calcItemMacros,
  calcMealMacros,
  computeBalanceScore,
  computeDailyTotals,
  daysBetweenISO,
  DEFAULT_SELECTED_MEALS,
  formatFullDateBR,
  formatShortDateBR,
  MEALS_DATA,
  TACO_FOODS,
  type DailyLogDTO,
  type OptionKey,
  type ProtocolCycleDTO,
  type SelectedMeals,
  type UserSettingsDTO,
  type WeightLogDTO,
} from "@/data/nutrition";
import { buildProjectedVsRealizedSeries, type ScaleMeasurementDTO } from "@/data/scale";
import ChangePinModal from "./ChangePinModal";
import ProtocolCycleModal from "./ProtocolCycleModal";
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
  initialCycles?: ProtocolCycleDTO[];
  initialCyclesHistoryAvailable?: boolean;
}

export default function NutritionDashboard({
  initialActiveDate,
  initialSettings,
  initialWeights,
  initialDailyLogs,
  initialTodayLog,
  initialScaleMeasurements,
  initialCycles = [],
  initialCyclesHistoryAvailable = true,
}: NutritionDashboardProps) {
  const router = useRouter();
  const [activeDate, setActiveDate] = useState<string>(initialActiveDate);
  const [settings, setSettings] = useState<UserSettingsDTO>(initialSettings);
  const [simDeficit, setSimDeficit] = useState<number>(initialSettings.sim_deficit);
  const [weights, setWeights] = useState<WeightLogDTO[]>(initialWeights);
  const [scaleMeasurements, setScaleMeasurements] =
    useState<ScaleMeasurementDTO[]>(initialScaleMeasurements);
  const [dailyLogs, setDailyLogs] = useState<DailyLogDTO[]>(initialDailyLogs);
  const [cycles, setCycles] = useState<ProtocolCycleDTO[]>(initialCycles);
  const [cyclesHistoryAvailable, setCyclesHistoryAvailable] = useState<boolean>(
    initialCyclesHistoryAvailable
  );

  const [selectedOptions, setSelectedOptions] = useState<SelectedMeals>(
    initialTodayLog.selected_options ?? DEFAULT_SELECTED_MEALS
  );
  const [waterMl, setWaterMl] = useState<number>(initialTodayLog.water_ml ?? 0);

  const [syncState, setSyncState] = useState<"saved" | "saving" | "error">("saved");
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [cycleModalOpen, setCycleModalOpen] = useState(false);

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
      const data = (await res.json()) as { weights?: WeightLogDTO[]; simDeficit?: number };
      if (data.weights) setWeights(data.weights);
      setSimDeficit(data.simDeficit ?? settings.sim_deficit);
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

  const protocolDays = Math.max(
    1,
    daysBetweenISO(settings.protocol_start_date, settings.protocol_end_date)
  );
  const activeCycle = cycles.find((c) => c.is_active) ?? null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 sm:py-8 space-y-6">
      {/* Header */}
      <header
        className="surface-card rounded-2xl p-5 sm:p-7 section-enter"
        style={{ "--enter-delay": "0ms" } as React.CSSProperties}
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCycleModalOpen(true)}
                className="btn-press inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-mono uppercase tracking-[0.12em] text-emerald-400/90 hover:text-emerald-300 cursor-pointer text-left"
                title="Gerenciar ciclos e datas do protocolo"
              >
                <span>{activeCycle ? activeCycle.name : "Protocolo Cutting"}</span>
                <span className="text-white/25">/</span>
                <span className="tabular-nums text-[var(--muted-foreground)]">
                  {protocolDays}d ({formatShortDateBR(settings.protocol_start_date)} – {formatFullDateBR(settings.protocol_end_date)})
                </span>
              </button>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                  syncState === "saving"
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/25"
                    : syncState === "error"
                      ? "bg-rose-500/10 text-rose-300 border-rose-500/25"
                      : "bg-white/[0.03] text-slate-300 border-white/[0.08]"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    syncState === "saving"
                      ? "bg-amber-400"
                      : syncState === "error"
                        ? "bg-rose-400"
                        : "bg-emerald-400"
                  }`}
                />
                {syncState === "saving"
                  ? "Salvando..."
                  : syncState === "error"
                    ? "Erro ao sincronizar"
                    : "Supabase sincronizado"}
              </span>
            </div>

            <h1 className="heading-display text-2xl sm:text-[30px] font-semibold text-white leading-tight">
              Painel de Acompanhamento Nutricional
            </h1>

            <p className="text-xs sm:text-sm text-[var(--muted-foreground)] tabular-nums">
              {settings.sex === 0 ? "Mulher" : "Homem"} • {settings.age_years ?? 33} anos •{" "}
              {((settings.height_cm ?? 181) / 100).toFixed(2).replace(".", ",")} m • início{" "}
              <span className="text-slate-200 font-medium">
                {Number(settings.start_weight_kg).toFixed(1).replace(".", ",")} kg
              </span>{" "}
              • Musculação 4x/sem
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <label className="input-field flex items-center gap-2 px-3 h-9 rounded-xl text-xs font-medium text-slate-300">
              <span className="text-[var(--muted-foreground)]">Dia</span>
              <input
                type="date"
                value={activeDate}
                onChange={(e) => {
                  if (e.target.value) handleSelectActiveDate(e.target.value);
                }}
                className="bg-transparent text-emerald-400 font-mono text-xs font-medium tabular-nums focus:outline-none cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => setCycleModalOpen(true)}
              className="btn-press h-9 px-3 rounded-xl text-xs font-medium bg-emerald-500/12 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-400/50 cursor-pointer"
              title="Iniciar novo ciclo ou editar datas e metas do protocolo"
            >
              Ciclos
            </button>
            <a
              href="/api/plano-pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press inline-flex items-center h-9 px-3 rounded-xl text-xs font-medium bg-white/[0.03] text-slate-200 border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14]"
              title="Abrir Plano Nutricional em PDF"
            >
              Plano PDF
            </a>
            <button
              type="button"
              onClick={() => setPinModalOpen(true)}
              className="btn-press h-9 px-3 rounded-xl text-xs font-medium bg-white/[0.03] text-slate-200 border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14] cursor-pointer"
              title="Alterar PIN"
            >
              PIN
            </button>
            <button
              type="button"
              onClick={() => void handleLock()}
              className="btn-press h-9 px-3 rounded-xl text-xs font-medium bg-white/[0.03] text-slate-400 border border-white/[0.08] hover:text-white hover:bg-white/[0.07] cursor-pointer"
              title="Bloquear tela com PIN"
            >
              Bloquear
            </button>
          </div>
        </div>

        {/* Telemetry KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-5 border-t border-white/[0.06]">
          <div className="kpi-tile p-3.5 rounded-xl">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
              TMB Basal
            </div>
            <div className="text-xl font-semibold font-mono tabular-nums text-white mt-1.5">
              {settings.tmb_kcal.toLocaleString("pt-BR")}
              <span className="text-xs font-sans font-normal text-[var(--muted-foreground)] ml-1">kcal</span>
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)] mt-1">Mifflin-St Jeor</div>
          </div>

          <div className="kpi-tile p-3.5 rounded-xl">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
              GET Manutenção
            </div>
            <div className="text-xl font-semibold font-mono tabular-nums text-white mt-1.5">
              {settings.get_kcal.toLocaleString("pt-BR")}
              <span className="text-xs font-sans font-normal text-[var(--muted-foreground)] ml-1">kcal</span>
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)] mt-1">Fator 1,375 (4x/sem)</div>
          </div>

          <div className="kpi-tile p-3.5 rounded-xl">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
              Meta Cutting
            </div>
            <div className="text-xl font-semibold font-mono tabular-nums text-emerald-400 mt-1.5">
              {settings.calorie_goal.toLocaleString("pt-BR")}
              <span className="text-xs font-sans font-normal text-emerald-400/70 ml-1">kcal</span>
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums mt-1">
              Déficit de ~{simDeficit} kcal/dia
            </div>
          </div>

          <div className="kpi-tile p-3.5 rounded-xl">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
              {latestReal
                ? `Realizado (${latestReal.label})`
                : `Meta (${formatShortDateBR(settings.protocol_end_date)})`}
            </div>
            <div className="text-xl font-semibold font-mono tabular-nums text-white mt-1.5 flex items-baseline gap-1.5">
              <span>
                {latestReal
                  ? `${latestReal.realizedKg.toFixed(1)}`
                  : `${pvrSummary.projectedFinalKg.toFixed(1).replace(".", ",")}`}
                <span className="text-xs font-sans font-normal text-[var(--muted-foreground)] ml-0.5">kg</span>
              </span>
              {latestReal ? (
                <span
                  className={`text-xs font-semibold ${
                    latestReal.deltaKg <= 0 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {latestReal.deltaKg <= 0 ? "" : "+"}
                  {latestReal.deltaKg.toFixed(1)}
                </span>
              ) : null}
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums mt-1">
              Proj. hoje {pvrSummary.projectedTodayKg.toFixed(1)} • Alvo{" "}
              {Number(settings.target_weight_min_kg).toFixed(0)}–{Number(settings.target_weight_max_kg).toFixed(0)} kg
            </div>
          </div>

          <div className="kpi-tile p-3.5 rounded-xl col-span-2 md:col-span-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
              Score Balanço
            </div>
            <div className="text-xl font-semibold font-mono tabular-nums text-emerald-400 mt-1.5">
              {balanceScore}
              <span className="text-xs font-sans font-normal text-[var(--muted-foreground)]">/100</span>
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
              {balanceScore >= 90 ? "Aderência excelente" : "Bom equilíbrio"}
            </div>
          </div>
        </div>
      </header>

      {/* Metas Diárias & Progresso */}
      <section
        className="surface-card rounded-2xl p-5 sm:p-6 space-y-5 section-enter"
        style={{ "--enter-delay": "45ms" } as React.CSSProperties}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="heading-section text-base sm:text-lg font-semibold text-white">
              Metas Diárias &amp; Progresso
              <span className="ml-2 text-xs font-mono font-normal text-[var(--muted-foreground)] tabular-nums">
                {formatFullDateBR(activeDate)}
              </span>
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Calculado em tempo real a partir das escolhas do cardápio e salvo na nuvem.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleResetPlan("A")}
            className="btn-press h-8 px-3 text-xs font-medium rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-200 hover:bg-white/[0.07] hover:border-white/[0.14] cursor-pointer"
          >
            Restaurar Plano Base (A)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {gpMetrics.map((m) => {
            const pct = Math.min(100, Math.round((m.actual / m.goal) * 100));
            let barColor = "bg-emerald-500";
            let statusEl = null;

            if (m.kind === "budget") {
              const diff = m.goal - m.actual;
              if (Math.abs(diff) <= 60) {
                statusEl = (
                  <span className="text-emerald-400 font-medium tabular-nums">
                    No alvo ({diff >= 0 ? `−${diff.toFixed(0)}` : `+${Math.abs(diff).toFixed(0)}`} kcal)
                  </span>
                );
              } else if (diff < -60) {
                barColor = "bg-amber-500";
                statusEl = (
                  <span className="text-amber-400 font-medium tabular-nums">
                    Acima (+{Math.abs(diff).toFixed(0)} kcal)
                  </span>
                );
              } else {
                statusEl = (
                  <span className="text-sky-400 font-medium tabular-nums">
                    Abaixo (−{diff.toFixed(0)} kcal)
                  </span>
                );
              }
            } else if (m.kind === "limit") {
              if (m.actual <= m.goal * 0.9) {
                statusEl = (
                  <span className="text-emerald-400 font-medium tabular-nums">
                    Controlado (−{(m.goal - m.actual).toFixed(0)} {m.unit})
                  </span>
                );
              } else {
                barColor = "bg-amber-500";
                statusEl = <span className="text-amber-400 font-medium">Próximo ao limite</span>;
              }
            } else {
              if (m.actual >= m.goal * 0.92) {
                statusEl = (
                  <span className="text-emerald-400 font-medium tabular-nums">Meta atingida ({pct}%)</span>
                );
              } else {
                barColor = "bg-sky-500";
                statusEl = (
                  <span className="text-amber-400 font-medium tabular-nums">
                    Faltam {(m.goal - m.actual).toFixed(0)} {m.unit}
                  </span>
                );
              }
            }

            return (
              <div key={m.key} className={`space-y-1.5 ${m.key === "kcal" ? "md:col-span-2" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-200">{m.label}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-semibold tabular-nums text-white">
                      {m.actual.toFixed(m.unit === "g" ? 1 : 0)}
                      <span className="text-[var(--muted-foreground)] font-normal">
                        {" "}/ {m.goal} {m.unit}
                      </span>
                    </span>
                    {statusEl}
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`w-full h-full rounded-full ${barColor} progress-fill`}
                    style={{ transform: `scaleX(${Math.max(0, Math.min(1, pct / 100))})` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">
              Hidratação Diária{" "}
              <span className="text-xs font-normal text-[var(--muted-foreground)] tabular-nums">
                (meta {settings.water_goal_ml.toLocaleString("pt-BR")} ml • 35 ml/kg)
              </span>
            </div>
            <div className="text-xs text-[var(--muted-foreground)] mt-0.5 tabular-nums">
              Registrado em {formatFullDateBR(activeDate)}:{" "}
              <span className="font-mono font-semibold text-white">{waterMl.toLocaleString("pt-BR")} ml</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAddWater(-250)}
              className="btn-press h-8 px-3 text-xs font-mono font-medium tabular-nums rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white cursor-pointer"
            >
              −250 ml
            </button>
            <button
              type="button"
              onClick={() => handleAddWater(250)}
              className="btn-press h-8 px-3 text-xs font-mono font-medium tabular-nums rounded-lg border border-white/[0.1] bg-white/[0.06] text-white hover:bg-white/[0.11] cursor-pointer"
            >
              +250 ml
            </button>
            <button
              type="button"
              onClick={() => handleAddWater(500)}
              className="btn-press h-8 px-3.5 text-xs font-mono font-semibold tabular-nums rounded-lg bg-emerald-500 text-[#032014] hover:bg-emerald-400 cursor-pointer"
            >
              +500 ml
            </button>
          </div>
        </div>
      </section>

      {/* Projected vs Realized Chart & Xiaomi Scale */}
      <div className="section-enter" style={{ "--enter-delay": "85ms" } as React.CSSProperties}>
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
      <section
        className="surface-card rounded-2xl p-5 sm:p-6 space-y-5 section-enter"
        style={{ "--enter-delay": "120ms" } as React.CSSProperties}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="heading-section text-base sm:text-lg font-semibold text-white">
              Cardápio Interativo — 5 Refeições Diárias
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Alterne entre as opções A, B ou C com macros oficiais TACO salvos automaticamente.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["A", "B", "C"] as const).map((planKey) => (
              <button
                key={planKey}
                type="button"
                onClick={() => handleResetPlan(planKey)}
                className="btn-press h-8 px-3 text-xs font-medium rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white cursor-pointer"
              >
                Todo Plano {planKey}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {MEALS_DATA.map((meal) => {
            const activeKey = selectedOptions[String(meal.id) as keyof SelectedMeals] ?? "A";
            const activeIdx = activeKey === "A" ? 0 : activeKey === "B" ? 1 : 2;
            const activeOpt = meal.options[activeKey];
            const mTotal = calcMealMacros(meal, activeKey);

            return (
              <div
                key={meal.id}
                className="surface-inset card-interactive p-4 rounded-xl flex flex-col justify-between space-y-3.5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-medium tabular-nums px-2 py-0.5 rounded-md bg-white/[0.05] text-slate-300 border border-white/[0.06]">
                      {meal.time}
                    </span>

                    {/* Native-grade sliding segmented control */}
                    <div
                      role="tablist"
                      aria-label={`Opções de ${meal.title}`}
                      className="relative grid grid-cols-3 p-0.5 rounded-lg bg-[#090c11] border border-white/[0.08] w-[144px]"
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-md bg-emerald-500 shadow-sm"
                        style={{
                          transform: `translateX(${activeIdx * 100}%)`,
                          transition: "transform 220ms var(--ease-out)",
                        }}
                      />
                      {(["A", "B", "C"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          role="tab"
                          aria-selected={activeKey === k}
                          onClick={() => handleSelectMealOption(meal.id, k)}
                          className={`relative z-10 py-1 text-[11px] font-semibold transition-colors duration-150 cursor-pointer ${
                            activeKey === k ? "text-[#032014]" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div key={`${meal.id}-${activeKey}`} className="space-y-2.5 content-swap">
                    <div>
                      <h3 className="text-sm font-semibold text-white tracking-tight">{meal.title}</h3>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{activeOpt.label}</p>
                    </div>
                    <ul className="divide-y divide-white/[0.06]">
                      {activeOpt.items.map((it, idx) => {
                        const f = TACO_FOODS[String(it.food_id)];
                        const m = calcItemMacros(it.food_id, it.grams);
                        return (
                          <li
                            key={`${it.food_id}-${idx}`}
                            className="flex items-start justify-between gap-2.5 text-xs py-2"
                          >
                            <div className="min-w-0">
                              <span className="font-medium text-slate-100 block leading-snug">
                                {f?.name ?? `TACO #${it.food_id}`}
                              </span>
                              <span className="text-[11px] text-[var(--muted-foreground)] block mt-0.5">
                                {it.grams}g • {it.note}
                              </span>
                            </div>
                            <div className="text-right whitespace-nowrap font-mono tabular-nums shrink-0">
                              <span className="font-semibold text-slate-100 text-[11px]">
                                {m.kcal.toFixed(0)} kcal
                              </span>
                              <span className="block text-[10px] text-[var(--muted-foreground)] mt-0.5">
                                P {m.p.toFixed(0)} · C {m.c.toFixed(0)} · G {m.f.toFixed(0)}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="font-semibold text-emerald-400">
                    {mTotal.kcal.toFixed(0)} kcal
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    P <b className="text-slate-200">{mTotal.p.toFixed(1)}</b> · C{" "}
                    <b className="text-slate-200">{mTotal.c.toFixed(1)}</b> · G{" "}
                    <b className="text-slate-200">{mTotal.f.toFixed(1)}</b> · Fib{" "}
                    <b className="text-slate-200">{mTotal.fib.toFixed(1)}</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* TACO Calculator (with Fuzzy Search) */}
      <div className="section-enter" style={{ "--enter-delay": "150ms" } as React.CSSProperties}>
        <TacoSwapCalculator />
      </div>

      {/* Daily Check-in + History */}
      <div className="section-enter" style={{ "--enter-delay": "175ms" } as React.CSSProperties}>
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
      </div>

      <ChangePinModal open={pinModalOpen} onClose={() => setPinModalOpen(false)} />
      <ProtocolCycleModal
        open={cycleModalOpen}
        onClose={() => setCycleModalOpen(false)}
        settings={settings}
        latestWeightKg={latestReal ? latestReal.realizedKg : null}
        cycles={cycles}
        historyAvailable={cyclesHistoryAvailable}
        onCycleSaved={(result) => {
          setSettings(result.settings);
          setSimDeficit(result.settings.sim_deficit);
          if (result.weights.length > 0) setWeights(result.weights);
          setCycles(result.cycles);
          setCyclesHistoryAvailable(result.historyAvailable);
        }}
        onCycleDeleted={(id) => {
          setCycles((prev) => prev.filter((c) => c.id !== id));
        }}
      />
    </div>
  );
}

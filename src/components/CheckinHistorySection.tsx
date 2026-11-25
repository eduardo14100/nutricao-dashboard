"use client";

import { useEffect, useState } from "react";
import {
  buildCheckinReportText,
  DIGESTION_OPTIONS,
  ENERGY_OPTIONS,
  formatFullDateBR,
  HUNGER_OPTIONS,
  type DailyLogDTO,
  type SelectedMeals,
} from "@/data/nutrition";

interface CheckinHistorySectionProps {
  activeDate: string;
  selectedOptions: SelectedMeals;
  waterMl: number;
  dailyLogs: DailyLogDTO[];
  initialWeightKg: number | null;
  onSelectActiveDate: (date: string) => void;
  onSaveCheckin: (payload: {
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
  }) => Promise<void>;
  onDeleteCheckin: (logDate: string) => Promise<void>;
}

export default function CheckinHistorySection({
  activeDate,
  selectedOptions,
  waterMl,
  dailyLogs,
  initialWeightKg,
  onSelectActiveDate,
  onSaveCheckin,
  onDeleteCheckin,
}: CheckinHistorySectionProps) {
  const existingForDate = dailyLogs.find((d) => d.log_date === activeDate);

  const [weightStr, setWeightStr] = useState<string>(
    existingForDate?.weight_kg !== null && existingForDate?.weight_kg !== undefined
      ? String(existingForDate.weight_kg)
      : initialWeightKg !== null
        ? String(initialWeightKg)
        : "87.0"
  );
  const [hungerScore, setHungerScore] = useState<number>(existingForDate?.hunger_score ?? 3);
  const [energyScore, setEnergyScore] = useState<number>(existingForDate?.training_energy_score ?? 8);
  const [digestion, setDigestion] = useState<string>(
    existingForDate?.sleep_digestion ?? DIGESTION_OPTIONS[0].value
  );
  const [notes, setNotes] = useState<string>(existingForDate?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const row = dailyLogs.find((d) => d.log_date === activeDate);
    if (row) {
      if (row.weight_kg !== null && row.weight_kg !== undefined) {
        setWeightStr(String(row.weight_kg));
      }
      setHungerScore(row.hunger_score ?? 3);
      setEnergyScore(row.training_energy_score ?? 8);
      setDigestion(row.sleep_digestion ?? DIGESTION_OPTIONS[0].value);
      setNotes(row.notes ?? "");
    } else {
      setHungerScore(3);
      setEnergyScore(8);
      setDigestion(DIGESTION_OPTIONS[0].value);
      setNotes("");
    }
  }, [activeDate, dailyLogs]);

  const hungerLabel =
    HUNGER_OPTIONS.find((h) => h.value === hungerScore)?.label ?? `${hungerScore}/10`;
  const energyLabel =
    ENERGY_OPTIONS.find((e) => e.value === energyScore)?.label ?? `${energyScore}/10`;

  const parsedWeight = weightStr.trim() === "" ? null : parseFloat(weightStr);
  const validWeight = parsedWeight !== null && !Number.isNaN(parsedWeight) ? parsedWeight : null;

  const previewText = buildCheckinReportText({
    logDate: activeDate,
    weightKg: validWeight,
    waterMl,
    selectedOptions,
    hungerLabel,
    energyLabel,
    sleepDigestion: digestion,
    notes,
  });

  const handleSave = async () => {
    setSaving(true);
    setSavedToast(null);
    try {
      await onSaveCheckin({
        log_date: activeDate,
        weight_kg: validWeight,
        water_ml: waterMl,
        selected_options: selectedOptions,
        hunger_score: hungerScore,
        hunger_label: hungerLabel,
        training_energy_score: energyScore,
        training_energy_label: energyLabel,
        sleep_digestion: digestion,
        notes,
      });
      setSavedToast("✅ Check-in salvo no Supabase e curva EWMA atualizada!");
      setTimeout(() => setSavedToast(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Clipboard API unavailable
    }
  };

  const submittedHistory = dailyLogs.filter(
    (d) => d.checkin_submitted || d.weight_kg !== null || (d.notes && d.notes.trim().length > 0)
  );

  return (
    <div className="space-y-6">
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              📝 Check-in Diário (Peso, Alimentação e Sensações)
            </h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Salve seu registro direto no <b>Supabase</b> (atualiza automaticamente a curva EWMA e o histórico) ou copie o relatório formatado para o chat.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition cursor-pointer"
            >
              {saving ? "Salvando..." : "💾 Salvar Check-in no Supabase"}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy(previewText, "current")}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-90 transition cursor-pointer"
            >
              {copiedId === "current" ? "✅ Copiado!" : "📋 Copiar Relatório"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Data do Registro</label>
            <input
              type="date"
              value={activeDate}
              onChange={(e) => {
                if (e.target.value) onSelectActiveDate(e.target.value);
              }}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Peso em Jejum (kg)</label>
            <input
              type="number"
              step="0.1"
              value={weightStr}
              onChange={(e) => setWeightStr(e.target.value)}
              placeholder="Ex: 86.2"
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)] font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">
              Fome no Dia (1=Zero, 10=Muita)
            </label>
            <select
              value={hungerScore}
              onChange={(e) => setHungerScore(Number(e.target.value))}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)]"
            >
              {HUNGER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">
              Energia no Treino 18h (1-10)
            </label>
            <select
              value={energyScore}
              onChange={(e) => setEnergyScore(Number(e.target.value))}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)]"
            >
              {ENERGY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Sono &amp; Digestão</label>
            <select
              value={digestion}
              onChange={(e) => setDigestion(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)]"
            >
              {DIGESTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--muted-foreground)] mb-1">
            O que comeu hoje / Trocas / Furos na dieta (escreva livremente)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Segui 100% o Plano A, mas no almoço comi 120g de arroz branco e à noite tomei 1 taça de vinho..."
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)]"
          />
        </div>

        <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--background)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <pre className="text-xs text-[var(--muted-foreground)] whitespace-pre-wrap font-mono">
            {previewText}
          </pre>
          {savedToast ? (
            <span className="text-xs font-semibold text-emerald-400 shrink-0">{savedToast}</span>
          ) : null}
        </div>
      </section>

      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[var(--border)] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                📚 Histórico de Check-ins Salvos (Supabase)
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                {submittedHistory.length} registro(s)
              </span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Clique em <b>Carregar / Editar</b> para abrir qualquer dia anterior no painel, revisar macros ou atualizar anotações.
            </p>
          </div>
        </div>

        {submittedHistory.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] text-center text-xs text-[var(--muted-foreground)]">
            Nenhum check-in salvo ainda. Preencha o formulário acima e clique em{" "}
            <b className="text-emerald-400">Salvar Check-in no Supabase</b> para iniciar seu histórico na nuvem!
          </div>
        ) : (
          <div className="space-y-3">
            {submittedHistory.map((item) => {
              const report = buildCheckinReportText({
                logDate: item.log_date,
                weightKg: item.weight_kg !== null ? Number(item.weight_kg) : null,
                waterMl: item.water_ml,
                selectedOptions: item.selected_options,
                hungerLabel: item.hunger_label ?? `${item.hunger_score ?? "—"}/10`,
                energyLabel: item.training_energy_label ?? `${item.training_energy_score ?? "—"}/10`,
                sleepDigestion: item.sleep_digestion ?? "—",
                notes: item.notes ?? "",
              });
              const isSelectedDate = item.log_date === activeDate;
              return (
                <div
                  key={item.log_date}
                  className={`p-4 rounded-xl border bg-[var(--background)] space-y-2.5 transition ${
                    isSelectedDate ? "border-emerald-500/60" : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        📅 {formatFullDateBR(item.log_date)}
                      </span>
                      {item.weight_kg !== null ? (
                        <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          ⚖️ {Number(item.weight_kg).toFixed(1)} kg
                        </span>
                      ) : null}
                      {item.total_kcal !== null ? (
                        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--card)] text-slate-200 border border-[var(--border)]">
                          🔥 {Number(item.total_kcal).toFixed(0)} kcal (P:{Number(item.total_protein_g ?? 0).toFixed(0)}g • C:
                          {Number(item.total_carbs_g ?? 0).toFixed(0)}g • G:{Number(item.total_fat_g ?? 0).toFixed(0)}g)
                        </span>
                      ) : null}
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        💧 {item.water_ml.toLocaleString("pt-BR")} ml
                      </span>
                      {item.balance_score !== null ? (
                        <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400">
                          Score {item.balance_score}/100
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectActiveDate(item.log_date)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--card)] border border-[var(--border)] text-slate-200 hover:border-emerald-500 transition cursor-pointer"
                      >
                        ✏️ Carregar / Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopy(report, item.log_date)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--card)] border border-[var(--border)] text-slate-200 hover:border-emerald-500 transition cursor-pointer"
                      >
                        {copiedId === item.log_date ? "✅ Copiado" : "📋 Copiar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteCheckin(item.log_date)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted-foreground)]">
                    <span>
                      🍽️ Cardápio:{" "}
                      <b className="text-slate-300">
                        {["1", "2", "3", "4", "5"]
                          .map((k) => `R${k}:${item.selected_options?.[k as keyof SelectedMeals] ?? "A"}`)
                          .join(" • ")}
                      </b>
                    </span>
                    {item.hunger_label ? <span>😋 Fome: {item.hunger_label}</span> : null}
                    {item.training_energy_label ? <span>🏋️ Treino: {item.training_energy_label}</span> : null}
                    {item.sleep_digestion ? <span>😴 {item.sleep_digestion}</span> : null}
                  </div>

                  {item.notes ? (
                    <div className="text-xs text-slate-200 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2">
                      “{item.notes}”
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

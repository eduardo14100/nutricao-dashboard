"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDaysISO,
  daysBetweenISO,
  formatFullDateBR,
  formatShortDateBR,
  getTodayBrazilISO,
  type ProtocolCycleDTO,
  type UserSettingsDTO,
  type WeightLogDTO,
} from "@/data/nutrition";
import { projectedWeightForDay } from "@/data/scale";

interface ProtocolCycleModalProps {
  open: boolean;
  onClose: () => void;
  settings: UserSettingsDTO;
  latestWeightKg: number | null;
  cycles: ProtocolCycleDTO[];
  historyAvailable: boolean;
  onCycleSaved: (result: {
    settings: UserSettingsDTO;
    weights: WeightLogDTO[];
    cycles: ProtocolCycleDTO[];
    historyAvailable: boolean;
  }) => void;
  onCycleDeleted: (id: number) => void;
}

type TabKey = "new" | "edit" | "history";

export default function ProtocolCycleModal({
  open,
  onClose,
  settings,
  latestWeightKg,
  cycles,
  historyAvailable,
  onCycleSaved,
  onCycleDeleted,
}: ProtocolCycleModalProps) {
  const activeCycle = useMemo(() => cycles.find((c) => c.is_active) ?? null, [cycles]);
  const [tab, setTab] = useState<TabKey>("new");

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startWeight, setStartWeight] = useState("");
  const [targetMin, setTargetMin] = useState("");
  const [targetMax, setTargetMax] = useState("");
  const [deficit, setDeficit] = useState("");
  const [updateCalorieGoal, setUpdateCalorieGoal] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const hydrateForm = (targetTab: TabKey) => {
    setStatus(null);
    if (targetTab === "edit") {
      setName(
        activeCycle?.name ??
          `Protocolo ${formatShortDateBR(settings.protocol_start_date)} a ${formatShortDateBR(settings.protocol_end_date)}`
      );
      setStartDate(settings.protocol_start_date);
      setEndDate(settings.protocol_end_date);
      setStartWeight(Number(settings.start_weight_kg).toFixed(1));
      setTargetMin(Number(settings.target_weight_min_kg).toFixed(1));
      setTargetMax(Number(settings.target_weight_max_kg).toFixed(1));
      setDeficit(String(settings.sim_deficit));
      setUpdateCalorieGoal(false);
      setNotes(activeCycle?.notes ?? "");
    } else if (targetTab === "new") {
      const today = getTodayBrazilISO();
      const suggestedEnd = addDaysISO(today, 60);
      const baseWeight = latestWeightKg ?? Number(settings.start_weight_kg);
      const def = Number(settings.sim_deficit) || 530;
      const projFinal = projectedWeightForDay(baseWeight, def, 60);
      setName("");
      setStartDate(today);
      setEndDate(suggestedEnd);
      setStartWeight(baseWeight.toFixed(1));
      setTargetMin(Math.max(40, Math.round((projFinal - 0.5) * 2) / 2).toFixed(1));
      setTargetMax(Math.max(41, Math.round((projFinal + 0.5) * 2) / 2).toFixed(1));
      setDeficit(String(def));
      setUpdateCalorieGoal(false);
      setNotes("");
    }
  };

  useEffect(() => {
    if (open) {
      setTab("new");
      hydrateForm("new");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const preview = useMemo(() => {
    if (!startDate || !endDate || endDate <= startDate) return null;
    const days = daysBetweenISO(startDate, endDate);
    const sw = parseFloat(startWeight);
    const def = parseFloat(deficit);
    if (Number.isNaN(sw) || Number.isNaN(def) || days < 1) return null;
    const projectedFinal = projectedWeightForDay(sw, def, days);
    const weeklyLoss = (def * 7) / 7700;
    const nextKcal = Math.max(1200, Math.round(settings.get_kcal - def));
    return { days, projectedFinal, weeklyLoss, nextKcal };
  }, [startDate, endDate, startWeight, deficit, settings.get_kcal]);

  if (!open) return null;

  const switchTab = (next: TabKey) => {
    setTab(next);
    if (next === "new" || next === "edit") hydrateForm(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (tab === "history") return;

    if (!startDate || !endDate || endDate <= startDate) {
      setStatus({ type: "error", text: "A data final deve ser posterior à data inicial." });
      return;
    }

    const sw = parseFloat(startWeight);
    const tMin = parseFloat(targetMin);
    const tMax = parseFloat(targetMax);
    const def = Math.round(parseFloat(deficit));

    if (Number.isNaN(sw) || sw < 35 || sw > 250) {
      setStatus({ type: "error", text: "Peso inicial deve estar entre 35 e 250 kg." });
      return;
    }
    if (Number.isNaN(tMin) || Number.isNaN(tMax) || tMin > tMax) {
      setStatus({ type: "error", text: "A meta mínima deve ser menor ou igual à meta máxima." });
      return;
    }
    if (Number.isNaN(def) || def < 100 || def > 1500) {
      setStatus({ type: "error", text: "Déficit deve estar entre 100 e 1500 kcal/dia." });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: tab,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          start_weight_kg: sw,
          target_weight_min_kg: tMin,
          target_weight_max_kg: tMax,
          sim_deficit: def,
          update_calorie_goal: updateCalorieGoal,
          notes: notes.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        settings?: UserSettingsDTO;
        weights?: WeightLogDTO[];
        cycles?: ProtocolCycleDTO[];
        historyAvailable?: boolean;
      };
      if (!res.ok || !data.ok || !data.settings) {
        setStatus({ type: "error", text: data.error ?? "Erro ao salvar protocolo." });
        return;
      }

      onCycleSaved({
        settings: data.settings,
        weights: data.weights ?? [],
        cycles: data.cycles ?? [],
        historyAvailable: data.historyAvailable ?? historyAvailable,
      });

      setStatus({
        type: "success",
        text:
          tab === "new"
            ? "✅ Novo ciclo iniciado! O gráfico e as projeções já foram atualizados."
            : "✅ Ciclo atual atualizado no Supabase!",
      });
      setTimeout(() => {
        setStatus(null);
        onClose();
      }, 1200);
    } catch {
      setStatus({ type: "error", text: "Erro de conexão ao salvar o ciclo." });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArchived = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/cycles?id=${id}`, { method: "DELETE" });
      if (res.ok) onCycleDeleted(id);
    } finally {
      setDeletingId(null);
    }
  };

  const tabIndex = tab === "new" ? 0 : tab === "edit" ? 1 : 2;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto modal-backdrop-enter"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="surface-modal modal-panel-enter rounded-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 my-auto">
        <div className="flex items-start justify-between border-b border-white/[0.07] pb-3.5 gap-2">
          <div>
            <h2 className="heading-section text-base font-semibold text-white">Ciclos &amp; Protocolo</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Gerencie datas, peso inicial e meta sem depender de valores fixos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press text-slate-400 hover:text-white text-sm px-2 py-1 rounded-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Sliding segmented tabs */}
        <div className="relative grid grid-cols-3 bg-[#090c11] p-1 rounded-xl border border-white/[0.08] text-xs font-semibold">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/3)] rounded-lg bg-emerald-500 shadow-sm"
            style={{
              transform: `translateX(${tabIndex * 100}%)`,
              transition: "transform 220ms var(--ease-out)",
            }}
          />
          <button
            type="button"
            onClick={() => switchTab("new")}
            className={`relative z-10 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer ${
              tab === "new" ? "text-[#032014]" : "text-slate-300 hover:text-white"
            }`}
          >
            Novo Ciclo
          </button>
          <button
            type="button"
            onClick={() => switchTab("edit")}
            className={`relative z-10 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer ${
              tab === "edit" ? "text-[#032014]" : "text-slate-300 hover:text-white"
            }`}
          >
            Editar Atual
          </button>
          <button
            type="button"
            onClick={() => switchTab("history")}
            className={`relative z-10 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer tabular-nums ${
              tab === "history" ? "text-[#032014]" : "text-slate-300 hover:text-white"
            }`}
          >
            Histórico ({cycles.length})
          </button>
        </div>

        {tab === "history" ? (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {!historyAvailable ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
                <div className="font-semibold">Tabela de histórico ainda não criada no Supabase</div>
                <p className="text-[11px] text-amber-200/80">
                  Você já pode criar e editar o ciclo atual normalmente. Para guardar o histórico de ciclos anteriores, rode a migração{" "}
                  <code className="font-mono text-amber-100">20261126_protocol_cycles.sql</code> no SQL Editor do Supabase.
                </p>
              </div>
            ) : cycles.length === 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-xs text-[var(--muted-foreground)] text-center space-y-1">
                <div>Nenhum ciclo arquivado ainda.</div>
                <div className="text-[11px]">
                  Ciclo ativo atual: {formatFullDateBR(settings.protocol_start_date)} a{" "}
                  {formatFullDateBR(settings.protocol_end_date)} ({Number(settings.start_weight_kg).toFixed(1)} kg →{" "}
                  {Number(settings.target_weight_min_kg).toFixed(1)}–{Number(settings.target_weight_max_kg).toFixed(1)} kg).
                </div>
              </div>
            ) : (
              cycles.map((c) => {
                const days = Math.max(1, daysBetweenISO(c.start_date, c.end_date));
                const endWeight = c.is_active ? latestWeightKg : c.final_weight_kg;
                const hit =
                  endWeight !== null &&
                  endWeight >= Number(c.target_weight_min_kg) - 0.3 &&
                  endWeight <= Number(c.target_weight_max_kg) + 0.3;
                return (
                  <div
                    key={c.id}
                    className={`rounded-xl border p-3.5 space-y-1.5 ${
                      c.is_active
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-[var(--border)] bg-[var(--background)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{c.name}</span>
                        {c.is_active ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold">
                            ATIVO
                          </span>
                        ) : null}
                      </div>
                      {!c.is_active ? (
                        <button
                          type="button"
                          disabled={deletingId === c.id}
                          onClick={() => void handleDeleteArchived(c.id)}
                          className="text-[11px] text-rose-400 hover:underline disabled:opacity-50 cursor-pointer"
                        >
                          {deletingId === c.id ? "Removendo..." : "Remover"}
                        </button>
                      ) : null}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {formatFullDateBR(c.start_date)} a {formatFullDateBR(c.end_date)} • {days} dias • Déficit:{" "}
                      {c.sim_deficit} kcal/dia
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                      <span>
                        Início: <b className="text-white">{Number(c.start_weight_kg).toFixed(1)} kg</b>
                      </span>
                      <span>
                        Meta:{" "}
                        <b className="text-sky-300">
                          {Number(c.target_weight_min_kg).toFixed(1)}–{Number(c.target_weight_max_kg).toFixed(1)} kg
                        </b>
                      </span>
                      <span>
                        {c.is_active ? "Último peso:" : "Peso final:"}{" "}
                        <b className={hit ? "text-emerald-400" : "text-white"}>
                          {endWeight !== null ? `${Number(endWeight).toFixed(1)} kg` : "—"}
                        </b>
                      </span>
                    </div>
                    {c.notes ? (
                      <div className="text-[11px] text-slate-400 italic pt-0.5">{c.notes}</div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {tab === "new" ? (
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200">
                Ao iniciar um novo ciclo, o protocolo atual ({formatShortDateBR(settings.protocol_start_date)} a{" "}
                {formatShortDateBR(settings.protocol_end_date)}) fica arquivado no histórico e todas as suas pesagens anteriores continuam salvas no Supabase.
              </div>
            ) : null}

            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Nome do ciclo (opcional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Cutting Jan–Mar 2027"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Data de início</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Data final</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Peso inicial (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="35"
                  max="250"
                  value={startWeight}
                  onChange={(e) => setStartWeight(e.target.value)}
                  required
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Meta mín. (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="35"
                  max="250"
                  value={targetMin}
                  onChange={(e) => setTargetMin(e.target.value)}
                  required
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Meta máx. (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="35"
                  max="250"
                  value={targetMax}
                  onChange={(e) => setTargetMax(e.target.value)}
                  required
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Déficit planejado (kcal/dia)</label>
                <input
                  type="number"
                  step="10"
                  min="100"
                  max="1500"
                  value={deficit}
                  onChange={(e) => setDeficit(e.target.value)}
                  required
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
              <label className="flex items-start gap-2 text-[11px] text-slate-300 pt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateCalorieGoal}
                  onChange={(e) => setUpdateCalorieGoal(e.target.checked)}
                  className="mt-0.5 accent-emerald-500"
                />
                <span>
                  Ajustar meta calórica para{" "}
                  <b className="text-emerald-400">{preview ? `${preview.nextKcal} kcal` : "—"}</b> (GET − déficit)
                </span>
              </label>
            </div>

            {preview ? (
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--background)] border border-[var(--border)] p-2.5 text-center text-xs">
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Duração</div>
                  <div className="font-bold text-white">{preview.days} dias</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Projeção final</div>
                  <div className="font-bold text-sky-400">{preview.projectedFinal.toFixed(1)} kg</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Ritmo teórico</div>
                  <div className="font-bold text-emerald-400">-{preview.weeklyLoss.toFixed(2)} kg/sem</div>
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Observações (opcional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Foco em manter proteína alta e treino 4x/sem"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {status ? (
              <div
                className={`text-xs rounded-lg px-3 py-2 border ${
                  status.type === "error"
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-300"
                    : "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                }`}
              >
                {status.text}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition disabled:opacity-50 cursor-pointer"
              >
                {saving
                  ? "Salvando..."
                  : tab === "new"
                    ? "🚀 Iniciar Novo Ciclo"
                    : "💾 Salvar Alterações"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

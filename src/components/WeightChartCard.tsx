"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatShortDateBR,
  getTodayBrazilISO,
  type UserSettingsDTO,
  type WeightLogDTO,
} from "@/data/nutrition";
import {
  buildProjectedVsRealizedSeries,
  type ProjectedPoint,
  type ProjectedVsRealizedSeries,
  type RealizedDayPoint,
  type ScaleMeasurementDTO,
} from "@/data/scale";
import XiaomiScalePanel from "./XiaomiScalePanel";

interface WeightChartCardProps {
  weights: WeightLogDTO[];
  scaleMeasurements: ScaleMeasurementDTO[];
  settings: UserSettingsDTO;
  simDeficit: number;
  onDeficitChange: (nextDeficit: number) => void;
  onSaveWeight: (recordedDate: string, weightKg: number, notes?: string) => Promise<void>;
  onDeleteWeight: (recordedDate: string) => Promise<void>;
  onResetWeights: () => Promise<void>;
  onSyncScaleMeasurements: (
    measurements: Array<{
      measured_at: string;
      weight_kg: number;
      impedance_ohm: number | null;
      source: "ble-live" | "ble-history" | "manual";
    }>
  ) => Promise<number>;
  onDeleteScaleMeasurement: (id: number) => Promise<void>;
  onSaveBodyProfile: (profile: {
    height_cm: number;
    age_years: number;
    sex: 0 | 1;
    scale_user_id?: number;
  }) => Promise<void>;
}

interface HoverInspect {
  date: string;
  fullDateBR: string;
  day: number;
  projectedKg: number;
  realized: RealizedDayPoint | null;
  svgX: number;
  tipLeft: number;
  tipTop: number;
}

interface ProjectedVsRealizedSvgProps {
  data: ProjectedVsRealizedSeries;
  isModal: boolean;
  showProjected?: boolean;
  showRealized?: boolean;
  showEwma?: boolean;
  showTarget?: boolean;
  startWeight: number;
  targetMin: number;
  targetMax: number;
  onSelectDate: (date: string, weight: number) => void;
}

function ProjectedVsRealizedSvg({
  data,
  isModal,
  showProjected = true,
  showRealized = true,
  showEwma = true,
  showTarget = true,
  startWeight,
  targetMin,
  targetMax,
  onSelectDate,
}: ProjectedVsRealizedSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<HoverInspect | null>(null);

  const w = isModal ? 960 : 780;
  const h = isModal ? 360 : 280;
  const padL = isModal ? 60 : 54;
  const padR = isModal ? 28 : 22;
  const padT = isModal ? 30 : 24;
  const padB = isModal ? 44 : 36;

  const allVals = [
    ...data.projectedLine.map((p) => p.projectedKg),
    ...data.realizedDaily.flatMap((r) => [r.realizedKg, r.ewmaKg]),
  ];
  const minW = Math.min(targetMin - 0.6, ...allVals) - 0.35;
  const maxW = Math.max(startWeight + 0.4, ...allVals) + 0.35;

  const daySpan = Math.max(1, data.maxDay - data.minDay);
  const xPos = (day: number) => padL + ((day - data.minDay) / daySpan) * (w - padL - padR);
  const yPos = (val: number) =>
    padT + ((maxW - val) / Math.max(0.5, maxW - minW)) * (h - padT - padB);

  const gridSteps = isModal ? 6 : 5;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const val = minW + (i / gridSteps) * (maxW - minW);
    return { val, y: yPos(val) };
  });

  // Series paths
  const projectedPath = data.projectedLine
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xPos(p.day).toFixed(1)} ${yPos(p.projectedKg).toFixed(1)}`)
    .join(" ");

  const realizedPath = data.realizedDaily
    .map((r, i) => `${i === 0 ? "M" : "L"} ${xPos(r.day).toFixed(1)} ${yPos(r.realizedKg).toFixed(1)}`)
    .join(" ");

  const ewmaPath = data.realizedDaily
    .map((r, i) => `${i === 0 ? "M" : "L"} ${xPos(r.day).toFixed(1)} ${yPos(r.ewmaKg).toFixed(1)}`)
    .join(" ");

  const ewmaAreaPath =
    data.realizedDaily.length > 1
      ? `${ewmaPath} L ${xPos(data.realizedDaily[data.realizedDaily.length - 1].day).toFixed(1)} ${h - padB} L ${xPos(data.realizedDaily[0].day).toFixed(1)} ${h - padB} Z`
      : "";

  // Map realized by day for O(1) hover lookup
  const realizedByDay = useMemo(() => {
    const map = new Map<number, RealizedDayPoint>();
    for (const r of data.realizedDaily) map.set(r.day, r);
    return map;
  }, [data.realizedDaily]);

  // Snap targets: all realized days + all projected checkpoints (plus every day on modal)
  const snapPoints: ProjectedPoint[] = useMemo(() => {
    if (isModal) return data.projectedLine;
    const byDate = new Map<string, ProjectedPoint>();
    for (const cp of data.projectedCheckpoints) byDate.set(cp.date, cp);
    for (const r of data.realizedDaily) {
      byDate.set(r.date, {
        date: r.date,
        label: r.label,
        fullDateBR: r.fullDateBR,
        day: r.day,
        projectedKg: r.projectedKg,
        isCheckpoint: false,
      });
    }
    return Array.from(byDate.values()).sort((a, b) => a.day - b.day);
  }, [isModal, data.projectedLine, data.projectedCheckpoints, data.realizedDaily]);

  const computeHover = (clientX: number, clientY: number): HoverInspect | null => {
    const svg = svgRef.current;
    if (!svg || snapPoints.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const svgX = (mouseX / rect.width) * w;

    let nearest = snapPoints[0];
    let minD = Infinity;
    for (const pt of snapPoints) {
      const d = Math.abs(svgX - xPos(pt.day));
      if (d < minD) {
        minD = d;
        nearest = pt;
      }
    }

    const realized = realizedByDay.get(nearest.day) ?? null;
    const tipWidth = 225;
    let tipLeft = mouseX + 14;
    if (tipLeft + tipWidth > rect.width) tipLeft = Math.max(8, mouseX - tipWidth - 14);
    const tipTop = Math.max(8, mouseY - 52);

    return {
      date: nearest.date,
      fullDateBR: nearest.fullDateBR,
      day: nearest.day,
      projectedKg: nearest.projectedKg,
      realized,
      svgX: xPos(nearest.day),
      tipLeft,
      tipTop,
    };
  };

  const handlePointer = (clientX: number, clientY: number) => {
    const res = computeHover(clientX, clientY);
    if (res) setHover(res);
  };

  const todayInRange = data.todayDay >= data.minDay && data.todayDay <= data.maxDay;
  const gradId = isModal ? "pvrModalGrad" : "pvrCardGrad";

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className={`w-full ${isModal ? "h-64 sm:h-80" : "h-60 sm:h-72"} cursor-crosshair select-none`}
        onMouseMove={(e) => handlePointer(e.clientX, e.clientY)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchEnd={() => setHover(null)}
        onClick={(e) => {
          const res = computeHover(e.clientX, e.clientY);
          if (res) {
            onSelectDate(res.date, res.realized ? res.realized.realizedKg : res.projectedKg);
          }
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={isModal ? 0.25 : 0.2} />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid */}
        {gridLines.map((g, idx) => (
          <g key={idx}>
            <line
              x1={padL}
              y1={g.y}
              x2={w - padR}
              y2={g.y}
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 10}
              y={g.y + 4}
              textAnchor="end"
              fontSize={isModal ? 12 : 11}
              fill="currentColor"
              opacity="0.7"
            >
              {`${g.val.toFixed(1)} kg`}
            </text>
          </g>
        ))}

        {/* Target Zone (83-84 kg) */}
        {showTarget ? (
          <g>
            <rect
              x={padL}
              y={yPos(targetMax)}
              width={w - padL - padR}
              height={Math.max(4, yPos(targetMin) - yPos(targetMax))}
              fill="#10b981"
              fillOpacity="0.08"
              stroke="#10b981"
              strokeOpacity="0.28"
              strokeDasharray="4 3"
            />
            <text
              x={w - padR - 6}
              y={yPos(targetMax) + (isModal ? 15 : 10)}
              textAnchor="end"
              fontSize={isModal ? 11 : 9}
              fontWeight="bold"
              fill="#34d399"
              opacity="0.85"
            >
              {isModal
                ? `FAIXA ALVO META (${targetMin.toFixed(1)} – ${targetMax.toFixed(1)} kg)`
                : `ALVO: ${targetMin.toFixed(0)}–${targetMax.toFixed(0)} kg`}
            </text>
          </g>
        ) : null}

        {/* Vertical Today Marker */}
        {todayInRange ? (
          <g>
            <line
              x1={xPos(data.todayDay)}
              y1={padT}
              x2={xPos(data.todayDay)}
              y2={h - padB}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.45"
            />
            <text
              x={xPos(data.todayDay)}
              y={padT - 4}
              textAnchor="middle"
              fontSize={isModal ? 10 : 8}
              fill="#94a3b8"
              fontWeight="600"
            >
              Hoje
            </text>
          </g>
        ) : null}

        {/* EWMA Area */}
        {showEwma && ewmaAreaPath ? <path d={ewmaAreaPath} fill={`url(#${gradId})`} /> : null}

        {/* Series 1: Projected curve (sky dashed) */}
        {showProjected && projectedPath ? (
          <path
            d={projectedPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={isModal ? 2.5 : 1.8}
            strokeDasharray={isModal ? "6 4" : "5 3"}
            opacity="0.9"
          />
        ) : null}

        {/* Projected weekly checkpoint ticks + X-axis labels */}
        {data.projectedCheckpoints.map((cp, idx) => {
          const cx = xPos(cp.day);
          const cy = yPos(cp.projectedKg);
          return (
            <g key={cp.date}>
              {showProjected ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={isModal ? 3.5 : 3}
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
              ) : null}
              <text
                x={cx}
                y={isModal ? h - 16 : h - 12}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="currentColor"
                opacity="0.78"
              >
                {cp.label}
              </text>
              {isModal ? (
                <text
                  x={cx}
                  y={h - 3}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#38bdf8"
                  opacity="0.65"
                >
                  Sem {idx}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Series 2: Realized day-by-day line (amber) */}
        {showRealized && data.realizedDaily.length > 1 ? (
          <path
            d={realizedPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={isModal ? 2.2 : 1.7}
            opacity="0.9"
          />
        ) : null}

        {/* Series 3: EWMA Realized trend line (emerald) */}
        {showEwma && data.realizedDaily.length > 1 ? (
          <path
            d={ewmaPath}
            fill="none"
            stroke="#10b981"
            strokeWidth={isModal ? 3.2 : 2.4}
          />
        ) : null}

        {/* Realized day-by-day dots (amber solid with dark stroke) */}
        {showRealized
          ? data.realizedDaily.map((r) => (
              <circle
                key={r.date}
                cx={xPos(r.day)}
                cy={yPos(r.realizedKg)}
                r={isModal ? 5 : 3.8}
                fill={r.deltaKg <= 0 ? "#10b981" : "#f59e0b"}
                stroke="#0f172a"
                strokeWidth={isModal ? 2 : 1.5}
              />
            ))
          : null}

        {/* Hover Crosshair */}
        {hover ? (
          <line
            x1={hover.svgX}
            y1={padT}
            x2={hover.svgX}
            y2={h - padB}
            stroke="#f8fafc"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.75"
            pointerEvents="none"
          />
        ) : null}
      </svg>

      {/* Interactive Tooltip */}
      {hover ? (
        <div
          style={{ left: hover.tipLeft, top: hover.tipTop }}
          className="pointer-events-none absolute z-30 bg-slate-900/95 border border-emerald-500/50 rounded-xl p-2.5 shadow-2xl text-xs backdrop-blur-md w-56"
        >
          <div className="font-bold text-white border-b border-slate-700/60 pb-1 mb-1.5 flex justify-between items-center gap-2">
            <span>📅 {hover.fullDateBR}</span>
            <span className="text-[10px] text-slate-400 font-normal">Dia {hover.day}</span>
          </div>

          <div className="space-y-1 text-[11px] leading-tight">
            <div className="flex justify-between gap-2">
              <span className="text-sky-400">🎯 Projetado:</span>
              <b className="text-sky-300">{hover.projectedKg.toFixed(2)} kg</b>
            </div>

            {hover.realized ? (
              <>
                <div className="flex justify-between gap-2">
                  <span className="text-amber-400">⚖️ Realizado (1ª):</span>
                  <b className="text-white">{hover.realized.realizedKg.toFixed(2)} kg</b>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-300">📊 Real − Proj:</span>
                  <b className={hover.realized.deltaKg <= 0 ? "text-emerald-400" : "text-amber-400"}>
                    {hover.realized.deltaKg <= 0 ? "" : "+"}
                    {hover.realized.deltaKg.toFixed(2)} kg{" "}
                    {hover.realized.deltaKg <= 0 ? "🚀" : "⚠️"}
                  </b>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-emerald-400">📈 EWMA Real:</span>
                  <b className="text-emerald-400">{hover.realized.ewmaKg.toFixed(2)} kg</b>
                </div>
                {hover.realized.bodyFatPct !== null || hover.realized.muscleKg !== null ? (
                  <div className="pt-1 mt-1 border-t border-slate-800 flex justify-between text-[10px] text-slate-300">
                    <span>
                      Gordura: <b>{hover.realized.bodyFatPct?.toFixed(1) ?? "—"}%</b>
                    </span>
                    <span>
                      Músculo: <b>{hover.realized.muscleKg?.toFixed(1) ?? "—"} kg</b>
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-[10px] text-slate-400 pt-0.5 italic">
                Sem pesagem realizada neste dia (clique para lançar).
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function WeightChartCard({
  weights,
  scaleMeasurements,
  settings,
  simDeficit,
  onDeficitChange,
  onSaveWeight,
  onDeleteWeight,
  onResetWeights,
  onSyncScaleMeasurements,
  onDeleteScaleMeasurement,
  onSaveBodyProfile,
}: WeightChartCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [dateInput, setDateInput] = useState<string>(getTodayBrazilISO());
  const [weightInput, setWeightInput] = useState<string>("86.2");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [showProjected, setShowProjected] = useState(true);
  const [showRealized, setShowRealized] = useState(true);
  const [showEwma, setShowEwma] = useState(true);
  const [showTarget, setShowTarget] = useState(true);

  const modalRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const seriesData = useMemo(
    () =>
      buildProjectedVsRealizedSeries({
        weights,
        scaleMeasurements,
        simDeficit,
        settings,
      }),
    [weights, scaleMeasurements, simDeficit, settings]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, []);

  const latest = seriesData.latestRealized;
  const intakeKcal = Math.round(settings.get_kcal - simDeficit);
  const hitProjectedTarget =
    seriesData.projectedFinalKg >= Number(settings.target_weight_min_kg) - 0.3 &&
    seriesData.projectedFinalKg <= Number(settings.target_weight_max_kg) + 0.3;

  const handleSaveManual = async () => {
    const val = parseFloat(weightInput);
    if (Number.isNaN(val) || val < 35 || val > 250) return;
    setSaving(true);
    setFeedback(null);
    try {
      await onSaveWeight(dateInput, val, "Pesagem manual registrada no painel");
      setFeedback(`✅ Pesagem de ${val.toFixed(1)} kg salva no Supabase!`);
      setTimeout(() => setFeedback(null), 2800);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectDate = (date: string, weight: number) => {
    setDateInput(date);
    setWeightInput(weight.toFixed(1));
  };

  const toggleFullscreen = () => {
    if (!modalRef.current) return;
    if (!document.fullscreenElement) {
      modalRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <>
      <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Acompanhamento de Peso — Projetado × Realizado
              </h2>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium border border-emerald-500/30">
                EWMA α=0.15
              </span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Cruzamento dia a dia ({seriesData.realizedDaily.length} dia(s) realizado(s) no Supabase • 1ª pesagem/jejum) sincronizado com a balança Xiaomi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="self-start sm:self-auto flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition shadow-sm cursor-pointer"
          >
            <span>Maximizar Gráfico ⛶</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left 8 cols: Wide Projected vs Realized Chart + Controls + Day-by-Day Table */}
          <div className="lg:col-span-8 space-y-4">
            {/* Projected vs Realized KPI Strip */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-2.5">
                <div className="text-[11px] text-sky-400 font-medium">Projetado Hoje</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {seriesData.projectedTodayKg.toFixed(1)} kg
                </div>
              </div>
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-2.5">
                <div className="text-[11px] text-amber-400 font-medium">
                  Realizado ({latest ? latest.label : "—"})
                </div>
                <div className="text-base font-bold text-white mt-0.5">
                  {latest ? `${latest.realizedKg.toFixed(1)} kg` : "—"}
                </div>
              </div>
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-2.5">
                <div className="text-[11px] text-[var(--muted-foreground)] font-medium">
                  Desvio (Real − Proj)
                </div>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    !latest
                      ? "text-slate-400"
                      : latest.deltaKg <= 0
                        ? "text-emerald-400"
                        : "text-amber-400"
                  }`}
                >
                  {latest
                    ? `${latest.deltaKg <= 0 ? "" : "+"}${latest.deltaKg.toFixed(2)} kg`
                    : "—"}
                </div>
              </div>
            </div>

            {/* Wide Main SVG Chart */}
            <div className="relative bg-[var(--background)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)] mb-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-b-2 border-dashed border-sky-400 inline-block" /> Projetado (Meta)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Realizado (1ª do dia)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Tendência EWMA
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="text-emerald-400 hover:text-emerald-300 text-xs font-medium cursor-pointer"
                >
                  Expandir tela cheia ↗
                </button>
              </div>

              <ProjectedVsRealizedSvg
                data={seriesData}
                isModal={false}
                startWeight={Number(settings.start_weight_kg)}
                targetMin={Number(settings.target_weight_min_kg)}
                targetMax={Number(settings.target_weight_max_kg)}
                onSelectDate={handleSelectDate}
              />

              <div className="text-[11px] text-slate-400 mt-1.5 flex flex-wrap justify-between items-center gap-2">
                <span>💡 Passe o mouse ou clique em qualquer dia para inspecionar Projetado × Realizado</span>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="text-emerald-400 font-medium hover:underline cursor-pointer"
                >
                  Abrir simulador completo ↗
                </button>
              </div>
            </div>

            {/* Manual weigh-in + deficit slider side by side */}
            <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-[var(--foreground)]">
                  Lançar Pesagem Manual por Data (Supabase):
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="bg-[var(--card)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--foreground)]"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    className="w-24 bg-[var(--card)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--foreground)] font-semibold"
                    placeholder="86.0"
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveManual()}
                    className="px-3.5 py-1.5 rounded text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
                {feedback ? <div className="text-xs text-emerald-400 font-medium">{feedback}</div> : null}
              </div>

              <div className="md:border-l md:border-[var(--border)] md:pl-4 space-y-1.5 min-w-[210px]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted-foreground)]">Déficit Projetado:</span>
                  <span className="font-bold text-emerald-400">{simDeficit} kcal/dia</span>
                </div>
                <input
                  type="range"
                  min={300}
                  max={800}
                  step={10}
                  value={simDeficit}
                  onChange={(e) => onDeficitChange(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
                  <span>300 kcal</span>
                  <span>Dieta: {intakeKcal} kcal</span>
                  <span>800 kcal</span>
                </div>
              </div>
            </div>

            {/* Collapsible Day-by-Day Table */}
            <details className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-3.5 text-xs">
              <summary className="cursor-pointer text-xs font-semibold text-emerald-400">
                📊 Ver tabela Projetado × Realizado dia a dia ({seriesData.realizedDaily.length} dia(s))
              </summary>
              <div className="overflow-x-auto mt-2.5 max-h-64 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="py-1.5 pr-3">Data</th>
                      <th className="py-1.5 pr-3">Projetado</th>
                      <th className="py-1.5 pr-3">Realizado</th>
                      <th className="py-1.5 pr-3">Desvio</th>
                      <th className="py-1.5 pr-3">EWMA</th>
                      <th className="py-1.5 pr-3">Gordura</th>
                      <th className="py-1.5">Músculo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {[...seriesData.realizedDaily].reverse().map((r) => (
                      <tr key={r.date}>
                        <td className="py-1.5 pr-3 whitespace-nowrap font-medium text-white">{r.fullDateBR}</td>
                        <td className="py-1.5 pr-3 text-sky-300">{r.projectedKg.toFixed(2)} kg</td>
                        <td className="py-1.5 pr-3 font-bold text-white">{r.realizedKg.toFixed(2)} kg</td>
                        <td
                          className={`py-1.5 pr-3 font-bold ${
                            r.deltaKg <= 0 ? "text-emerald-400" : "text-amber-400"
                          }`}
                        >
                          {r.deltaKg <= 0 ? "" : "+"}
                          {r.deltaKg.toFixed(2)} kg
                        </td>
                        <td className="py-1.5 pr-3 text-emerald-400">{r.ewmaKg.toFixed(2)} kg</td>
                        <td className="py-1.5 pr-3 text-slate-300">
                          {r.bodyFatPct !== null ? `${r.bodyFatPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-1.5 text-slate-300">
                          {r.muscleKg !== null ? `${r.muscleKg.toFixed(1)} kg` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          {/* Right 4 cols: Xiaomi Mi Body Composition Scale 2 (aligned to top, no stretching) */}
          <div className="lg:col-span-4">
            <XiaomiScalePanel
              settings={settings}
              scaleMeasurements={scaleMeasurements}
              onSyncMeasurements={onSyncScaleMeasurements}
              onDeleteMeasurement={onDeleteScaleMeasurement}
              onSaveProfile={onSaveBodyProfile}
            />
          </div>
        </div>
      </section>

      {/* Maximized Modal */}
      {modalOpen ? (
        <div
          ref={modalRef}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md overflow-y-auto p-2 sm:p-5 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-5xl shadow-2xl p-4 sm:p-6 space-y-4 max-h-[96vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--border)] pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-[var(--foreground)]">
                    Projetado × Realizado — Evolução Dia a Dia
                  </h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Meta: {Number(settings.target_weight_min_kg).toFixed(1)} –{" "}
                    {Number(settings.target_weight_max_kg).toFixed(1)} kg
                  </span>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Balança Xiaomi (1ª pesagem/jejum) cruzada sobre a projeção EWMA (α=0.15/dia) • Supabase
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--background)] hover:opacity-80 cursor-pointer"
                >
                  {isFullscreen ? "Sair da Tela Cheia" : "⛶ Tela Cheia"}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 cursor-pointer"
                >
                  ✕ Fechar (Esc)
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--background)] border border-[var(--border)] rounded-xl p-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-[var(--foreground)]">Camadas:</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-sky-400 font-medium">
                  <input
                    type="checkbox"
                    checked={showProjected}
                    onChange={(e) => setShowProjected(e.target.checked)}
                    className="accent-sky-500"
                  />
                  <span>Projetado (Meta)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-amber-400 font-medium">
                  <input
                    type="checkbox"
                    checked={showRealized}
                    onChange={(e) => setShowRealized(e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span>Realizado (Balança)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-emerald-400 font-medium">
                  <input
                    type="checkbox"
                    checked={showEwma}
                    onChange={(e) => setShowEwma(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>Tendência EWMA</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-emerald-300">
                  <input
                    type="checkbox"
                    checked={showTarget}
                    onChange={(e) => setShowTarget(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>Faixa Alvo</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--muted-foreground)]">Déficit Projetado:</span>
                <input
                  type="range"
                  min={300}
                  max={800}
                  step={10}
                  value={simDeficit}
                  onChange={(e) => onDeficitChange(Number(e.target.value))}
                  className="w-28 sm:w-36 accent-emerald-500 cursor-pointer"
                />
                <span className="font-bold text-emerald-400 w-16 text-right">{simDeficit} kcal</span>
              </div>
            </div>

            <div className="relative bg-[var(--background)] border border-[var(--border)] rounded-xl p-3 sm:p-4">
              <ProjectedVsRealizedSvg
                data={seriesData}
                isModal
                showProjected={showProjected}
                showRealized={showRealized}
                showEwma={showEwma}
                showTarget={showTarget}
                startWeight={Number(settings.start_weight_kg)}
                targetMin={Number(settings.target_weight_min_kg)}
                targetMax={Number(settings.target_weight_max_kg)}
                onSelectDate={handleSelectDate}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-[11px] text-[var(--muted-foreground)]">Último Realizado vs Projetado</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {latest ? `${latest.realizedKg.toFixed(2)} kg` : "—"}{" "}
                  <span
                    className={`text-xs ${
                      !latest
                        ? "text-slate-400"
                        : latest.deltaKg <= 0
                          ? "text-emerald-400"
                          : "text-amber-400"
                    }`}
                  >
                    {latest ? `(${latest.deltaKg <= 0 ? "" : "+"}${latest.deltaKg.toFixed(2)} kg)` : ""}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--muted-foreground)]">
                  {latest ? `Em ${latest.fullDateBR} (Proj: ${latest.projectedKg.toFixed(1)} kg)` : "Aguardando pesagem"}
                </div>
              </div>
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  Projeção Final ({formatShortDateBR(settings.protocol_end_date)})
                </div>
                <div className="text-base font-bold text-sky-400 mt-0.5">
                  {seriesData.projectedFinalKg.toFixed(1)} kg
                </div>
                <div className={`text-[10px] ${hitProjectedTarget ? "text-emerald-400 font-semibold" : "text-amber-400"}`}>
                  {hitProjectedTarget
                    ? `🎯 Dentro da meta ${Number(settings.target_weight_min_kg).toFixed(0)}–${Number(settings.target_weight_max_kg).toFixed(0)} kg`
                    : "Ajuste o déficit se desejar"}
                </div>
              </div>
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-[11px] text-[var(--muted-foreground)]">Ritmo Real (EWMA)</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {seriesData.weeklyRealRateKg !== null
                    ? `${seriesData.weeklyRealRateKg.toFixed(2)} kg/sem`
                    : "Aguardando 2+ dias"}
                </div>
                <div className="text-[10px] text-[var(--muted-foreground)]">
                  Meta teórica: -{((simDeficit * 7) / 7700).toFixed(2)} kg/sem
                </div>
              </div>
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-[11px] text-[var(--muted-foreground)]">Calorias da Dieta</div>
                <div className="text-base font-bold text-[var(--foreground)] mt-0.5">{intakeKcal} kcal/dia</div>
                <div className="text-[10px] text-emerald-400">Déficit: -{simDeficit} kcal/dia</div>
              </div>
            </div>

            {/* Full Day-by-Day Comparison Table */}
            <div className="border-t border-[var(--border)] pt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[var(--foreground)]">
                  📊 Histórico Dia a Dia — Projetado × Realizado (salvo no Supabase):
                </div>
                <button
                  type="button"
                  onClick={() => void onResetWeights()}
                  className="text-[11px] text-[var(--muted-foreground)] hover:text-emerald-400 transition cursor-pointer"
                >
                  ↺ Restaurar Checkpoints Base
                </button>
              </div>
              <div className="overflow-x-auto bg-[var(--background)] border border-[var(--border)] rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="py-2 px-3">Data</th>
                      <th className="py-2 px-3">Projetado</th>
                      <th className="py-2 px-3">Realizado (1ª)</th>
                      <th className="py-2 px-3">Desvio (Real−Proj)</th>
                      <th className="py-2 px-3">EWMA Real</th>
                      <th className="py-2 px-3">Gordura</th>
                      <th className="py-2 px-3">Músculo</th>
                      <th className="py-2 px-3">Origem</th>
                      <th className="py-2 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {[...seriesData.realizedDaily].reverse().map((r) => (
                      <tr key={r.date} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-semibold text-white whitespace-nowrap">
                          {r.fullDateBR}
                        </td>
                        <td className="py-2 px-3 text-sky-300">{r.projectedKg.toFixed(2)} kg</td>
                        <td className="py-2 px-3 font-bold text-white">{r.realizedKg.toFixed(2)} kg</td>
                        <td
                          className={`py-2 px-3 font-bold ${
                            r.deltaKg <= 0 ? "text-emerald-400" : "text-amber-400"
                          }`}
                        >
                          {r.deltaKg <= 0 ? "" : "+"}
                          {r.deltaKg.toFixed(2)} kg
                        </td>
                        <td className="py-2 px-3 text-emerald-400 font-semibold">
                          {r.ewmaKg.toFixed(2)} kg
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          {r.bodyFatPct !== null ? `${r.bodyFatPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          {r.muscleKg !== null ? `${r.muscleKg.toFixed(1)} kg` : "—"}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-[var(--muted-foreground)]">
                          {r.source === "ble-live" || r.source === "ble-history"
                            ? `⚖️ Xiaomi (${r.readingsCount}x)`
                            : r.source === "checkin"
                              ? "📝 Check-in"
                              : r.source === "checkpoint"
                                ? "🏁 Início"
                                : "✍️ Manual"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {r.date !== settings.protocol_start_date ? (
                            <button
                              type="button"
                              onClick={() => void onDeleteWeight(r.date)}
                              className="text-rose-400 hover:underline text-[11px] cursor-pointer"
                            >
                              Remover
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500">Base</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

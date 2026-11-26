"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHR_BODY_COMP_MEAS,
  CHR_CURRENT_TIME,
  CHR_HISTORY,
  computeBodyComposition,
  parseScaleRecord,
  SVC_BODY_COMP,
  SVC_CURRENT_TIME,
  type ParsedBleRecord,
  type ScaleMeasurementDTO,
  type ScaleProfile,
} from "@/data/scale";
import type { UserSettingsDTO } from "@/data/nutrition";

interface XiaomiScalePanelProps {
  settings: UserSettingsDTO;
  scaleMeasurements: ScaleMeasurementDTO[];
  onSyncMeasurements: (
    measurements: Array<{
      measured_at: string;
      weight_kg: number;
      impedance_ohm: number | null;
      source: "ble-live" | "ble-history" | "manual";
    }>
  ) => Promise<number>;
  onDeleteMeasurement: (id: number) => Promise<void>;
  onSaveProfile: (profile: {
    height_cm: number;
    age_years: number;
    sex: 0 | 1;
    scale_user_id?: number;
  }) => Promise<void>;
}

// Minimal Web Bluetooth typings so TypeScript strict mode works without extra @types packages
interface BleCharacteristicLike extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BleCharacteristicLike>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
}
interface BleServiceLike {
  getCharacteristic(uuid: number | string): Promise<BleCharacteristicLike>;
}
interface BleGattServerLike {
  connect(): Promise<BleGattServerLike>;
  getPrimaryService(uuid: number | string): Promise<BleServiceLike>;
}
interface BleDeviceLike extends EventTarget {
  gatt?: BleGattServerLike;
}
interface WebBluetoothLike {
  requestDevice(options: {
    filters: Array<{ namePrefix?: string; services?: number[] }>;
    optionalServices?: number[];
  }): Promise<BleDeviceLike>;
}

function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Number(v).toFixed(digits).replace(".", ",");
}

export default function XiaomiScalePanel({
  settings,
  scaleMeasurements,
  onSyncMeasurements,
  onDeleteMeasurement,
  onSaveProfile,
}: XiaomiScalePanelProps) {
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "warn" | "err" | "info" }>({
    text: "Suba na balança e toque em conectar (Chrome no Android ou desktop).",
    tone: "info",
  });
  const [connected, setConnected] = useState(false);
  const [liveWeight, setLiveWeight] = useState<string>("—");
  const [liveFlag, setLiveFlag] = useState<string>("");
  const [syncing, setSyncing] = useState(false);

  const [heightInput, setHeightInput] = useState<string>(String(settings.height_cm ?? 181));
  const [ageInput, setAgeInput] = useState<string>(String(settings.age_years ?? 33));
  const [sexInput, setSexInput] = useState<string>(String(settings.sex ?? 1));
  const [savingProfile, setSavingProfile] = useState(false);

  // Manual bioimpedance entry (handy for iPhone / non-BLE browsers)
  const [manualDate, setManualDate] = useState<string>(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  );
  const [manualWeight, setManualWeight] = useState<string>("");
  const [manualImpedance, setManualImpedance] = useState<string>("");

  const lastLiveKeyRef = useRef<string>("");
  const historyBufferRef = useRef<ParsedBleRecord[]>([]);

  useEffect(() => {
    setHeightInput(String(settings.height_cm ?? 181));
    setAgeInput(String(settings.age_years ?? 33));
    setSexInput(String(settings.sex ?? 1));
  }, [settings.height_cm, settings.age_years, settings.sex]);

  useEffect(() => {
    const nav = navigator as Navigator & { bluetooth?: WebBluetoothLike };
    if (typeof navigator !== "undefined" && !nav.bluetooth) {
      setStatus({
        text: "⚠️ Bluetooth Web indisponível neste navegador. Use o Chrome no Android/PC ou registre manualmente abaixo.",
        tone: "warn",
      });
    }
  }, []);

  const profile: ScaleProfile = useMemo(
    () => ({
      height_cm: settings.height_cm ?? 181,
      age_years: settings.age_years ?? 33,
      sex: settings.sex === 0 ? 0 : 1,
    }),
    [settings.height_cm, settings.age_years, settings.sex]
  );

  // Latest measurement for body composition card
  const latestMeasurement = scaleMeasurements[0] ?? null;
  const latestComp = useMemo(() => {
    if (!latestMeasurement) return null;
    return computeBodyComposition(
      Number(latestMeasurement.weight_kg),
      latestMeasurement.impedance_ohm,
      profile
    );
  }, [latestMeasurement, profile]);

  // Track which measurement ID is the FIRST of each day (jejum) so we can badge it in history
  const firstOfDayIds = useMemo(() => {
    const byDate = new Map<string, { id: number; measured_at: string }>();
    for (const m of scaleMeasurements) {
      const cur = byDate.get(m.measured_date);
      if (!cur || m.measured_at < cur.measured_at) {
        byDate.set(m.measured_date, { id: m.id, measured_at: m.measured_at });
      }
    }
    return new Set(Array.from(byDate.values()).map((v) => v.id));
  }, [scaleMeasurements]);

  const ensureScaleUserId = async (): Promise<number> => {
    if (settings.scale_user_id && settings.scale_user_id > 0) {
      return settings.scale_user_id;
    }
    const generated = 1 + Math.floor(Math.random() * 65000);
    await onSaveProfile({
      height_cm: profile.height_cm,
      age_years: profile.age_years,
      sex: profile.sex,
      scale_user_id: generated,
    });
    return generated;
  };

  const commitBatch = async (
    records: ParsedBleRecord[],
    source: "ble-live" | "ble-history"
  ): Promise<number> => {
    if (records.length === 0) return 0;
    setSyncing(true);
    try {
      const payload = records.map((r) => ({
        measured_at: r.measured_at.toISOString(),
        weight_kg: r.weight_kg,
        impedance_ohm: r.impedance_ohm,
        source,
      }));
      return await onSyncMeasurements(payload);
    } finally {
      setSyncing(false);
    }
  };

  const handleConnect = async () => {
    const nav = navigator as Navigator & { bluetooth?: WebBluetoothLike };
    if (!nav.bluetooth) {
      setStatus({
        text: "❌ Este navegador não suporta Web Bluetooth. Abra no Chrome do Android ou Chrome/Edge no computador.",
        tone: "err",
      });
      return;
    }

    try {
      setStatus({
        text: 'Suba na balança para acordá-la e selecione "MIBFS" na lista…',
        tone: "info",
      });
      const dev = await nav.bluetooth.requestDevice({
        filters: [
          { namePrefix: "MIBFS" },
          { namePrefix: "MIBCS" },
          { namePrefix: "MI_SCALE" },
          { services: [SVC_BODY_COMP] },
        ],
        optionalServices: [SVC_BODY_COMP, SVC_CURRENT_TIME],
      });

      dev.addEventListener("gattserverdisconnected", () => {
        setConnected(false);
        setStatus({
          text: "Balança desconectada (ela desliga sozinha após alguns segundos). Clique em conectar novamente quando quiser.",
          tone: "warn",
        });
      });

      setStatus({ text: "Conectando à balança Xiaomi…", tone: "info" });
      if (!dev.gatt) throw new Error("GATT indisponível no dispositivo.");
      const server = await dev.gatt.connect();

      // Sync scale clock (best effort)
      try {
        const timeSvc = await server.getPrimaryService(SVC_CURRENT_TIME);
        const timeChr = await timeSvc.getCharacteristic(CHR_CURRENT_TIME);
        const n = new Date();
        const buf = new Uint8Array([
          n.getFullYear() & 0xff,
          n.getFullYear() >> 8,
          n.getMonth() + 1,
          n.getDate(),
          n.getHours(),
          n.getMinutes(),
          n.getSeconds(),
          ((n.getDay() + 6) % 7) + 1,
          0,
          0,
        ]);
        await timeChr.writeValueWithResponse(buf);
      } catch {
        // Optional firmware service
      }

      const svc = await server.getPrimaryService(SVC_BODY_COMP);

      // 1) Live measurements
      try {
        const live = await svc.getCharacteristic(CHR_BODY_COMP_MEAS);
        live.addEventListener("characteristicvaluechanged", (evt: Event) => {
          const target = evt.target as BleCharacteristicLike | null;
          const dv = target?.value;
          if (!dv || dv.byteLength < 13) return;
          const rec = parseScaleRecord(dv, 0);
          setLiveWeight(fmt(rec.weight_kg, 2));
          setLiveFlag(
            rec.removed
              ? "Pesagem finalizada"
              : rec.stabilized
                ? rec.impedance_ohm
                  ? "Estável ✓ (com bioimpedância)"
                  : "Estável – aguardando bioimpedância… (fique descalço)"
                : "Medindo…"
          );

          if (rec.stabilized && (rec.impedance_ohm || rec.removed)) {
            const key = `${rec.weight_kg}|${rec.impedance_ohm ?? "none"}`;
            if (key === lastLiveKeyRef.current) return;
            lastLiveKeyRef.current = key;
            void commitBatch([rec], "ble-live").then((added) => {
              if (added > 0) {
                setStatus({
                  text: `✅ Pesagem de ${fmt(rec.weight_kg, 2)} kg salva no Supabase e cruzada no gráfico Projetado × Realizado!`,
                  tone: "ok",
                });
              }
            });
          }
        });
        await live.startNotifications();
      } catch (e) {
        console.warn("Medição ao vivo indisponível:", e);
      }

      // 2) Stored scale memory history
      try {
        const hist = await svc.getCharacteristic(CHR_HISTORY);
        const userId = await ensureScaleUserId();

        hist.addEventListener("characteristicvaluechanged", (evt: Event) => {
          const target = evt.target as BleCharacteristicLike | null;
          const dv = target?.value;
          if (!dv) return;
          if (dv.byteLength === 1 && dv.getUint8(0) === 0x03) {
            const batch = [...historyBufferRef.current];
            historyBufferRef.current = [];
            void commitBatch(batch, "ble-history").then(async (added) => {
              try {
                await hist.writeValueWithResponse(new Uint8Array([0x03]));
                await hist.writeValueWithResponse(
                  new Uint8Array([0x04, 0xff, 0xff, (userId >> 8) & 0xff, userId & 0xff])
                );
              } catch {
                // Ignore ack error
              }
              setStatus({
                text:
                  added > 0
                    ? `✅ ${added} pesagem(ns) da memória da balança salva(s) no Supabase e cruzada(s) no gráfico!`
                    : "☁️ Histórico da balança já estava sincronizado (nenhuma pesagem nova).",
                tone: "ok",
              });
            });
            return;
          }
          for (let off = 0; off + 13 <= dv.byteLength; off += 13) {
            const rec = parseScaleRecord(dv, off);
            if (rec.weight_kg > 0) historyBufferRef.current.push(rec);
          }
        });

        await hist.writeValueWithResponse(
          new Uint8Array([0x01, 0xff, 0xff, (userId >> 8) & 0xff, userId & 0xff])
        );
        await hist.startNotifications();
        historyBufferRef.current = [];
        await hist.writeValueWithResponse(new Uint8Array([0x02]));
      } catch (e) {
        console.warn("Histórico da balança indisponível:", e);
      }

      setConnected(true);
      setStatus({
        text: "Conectada! Fique parado e descalço na balança até estabilizar — os dados vão direto para o Supabase.",
        tone: "ok",
      });
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name === "NotFoundError") {
        setStatus({ text: "Nenhuma balança selecionada.", tone: "warn" });
      } else {
        setStatus({ text: `❌ Erro: ${err?.message ?? String(e)}`, tone: "err" });
      }
    }
  };

  const handleSaveProfileClick = async () => {
    const h = parseInt(heightInput, 10) || 181;
    const age = parseInt(ageInput, 10) || 33;
    const sex: 0 | 1 = sexInput === "0" ? 0 : 1;
    setSavingProfile(true);
    try {
      await onSaveProfile({ height_cm: h, age_years: age, sex });
      setStatus({
        text: "✅ Perfil salvo no Supabase — composição corporal recalculada!",
        tone: "ok",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleManualScaleSubmit = async () => {
    const w = parseFloat(manualWeight);
    if (Number.isNaN(w) || w < 20 || w > 250) return;
    const imp = manualImpedance.trim() ? parseInt(manualImpedance, 10) : null;
    const measuredAt = new Date(`${manualDate}T07:30:00-03:00`).toISOString();
    setSyncing(true);
    try {
      const added = await onSyncMeasurements([
        {
          measured_at: measuredAt,
          weight_kg: w,
          impedance_ohm: imp && imp > 0 && imp < 3000 ? imp : null,
          source: "manual",
        },
      ]);
      setManualWeight("");
      setManualImpedance("");
      setStatus({
        text:
          added > 0
            ? `✅ Medição de ${fmt(w, 2)} kg salva no Supabase e cruzada no gráfico!`
            : "ℹ️ Medição duplicada ignorada (já existe registro muito próximo).",
        tone: "ok",
      });
    } finally {
      setSyncing(false);
    }
  };

  const statusColor =
    status.tone === "ok"
      ? "text-emerald-400"
      : status.tone === "warn"
        ? "text-amber-400"
        : status.tone === "err"
          ? "text-rose-400"
          : "text-[var(--muted-foreground)]";

  return (
    <div className="surface-inset rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <span className="truncate">Xiaomi Scale 2</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-emerald-400 border border-white/[0.08]">
              BLE
            </span>
          </div>
          <div className={`text-[11px] mt-1 leading-snug ${statusColor}`}>
            {syncing ? "Sincronizando medição com o Supabase..." : status.text}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleConnect()}
          className={`btn-press shrink-0 h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer ${
            connected
              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/35"
              : "bg-emerald-500 text-[#032014] hover:bg-emerald-400"
          }`}
        >
          {connected ? "Conectada" : "Conectar"}
        </button>
      </div>

      {/* Live Weight Telemetry Readout */}
      <div className="rounded-xl bg-[#090c11] border border-white/[0.06] px-4 py-3 flex items-baseline gap-2">
        <span className="text-3xl sm:text-[34px] font-semibold font-mono tabular-nums tracking-tight text-emerald-400">
          {liveWeight !== "—" ? liveWeight : latestMeasurement ? fmt(Number(latestMeasurement.weight_kg), 2) : "—"}
        </span>
        <span className="text-xs font-mono text-[var(--muted-foreground)]">kg</span>
        <span className="text-[11px] text-[var(--muted-foreground)] ml-auto text-right">{liveFlag}</span>
      </div>

      {/* 9-card body composition grid */}
      {latestMeasurement && latestComp ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Peso", `${fmt(Number(latestMeasurement.weight_kg), 2)} kg`],
              ["IMC", fmt(latestComp.bmi)],
              ["Gordura", latestComp.body_fat_pct !== null ? `${fmt(latestComp.body_fat_pct)} %` : "—"],
              ["Massa gorda", latestComp.fat_mass_kg !== null ? `${fmt(latestComp.fat_mass_kg)} kg` : "—"],
              ["Músculo", latestComp.muscle_kg !== null ? `${fmt(latestComp.muscle_kg)} kg` : "—"],
              ["Água", latestComp.water_pct !== null ? `${fmt(latestComp.water_pct)} %` : "—"],
              ["Massa óssea", latestComp.bone_kg !== null ? `${fmt(latestComp.bone_kg)} kg` : "—"],
              ["Visceral", latestComp.visceral_fat !== null ? fmt(latestComp.visceral_fat, 0) : "—"],
              ["Impedância", latestMeasurement.impedance_ohm ? `${latestMeasurement.impedance_ohm} Ω` : "—"],
            ].map(([label, val]) => (
              <div
                key={label}
                className="bg-white/[0.025] border border-white/[0.06] rounded-lg px-2.5 py-2"
              >
                <div className="text-[10px] text-[var(--muted-foreground)]">{label}</div>
                <div className="text-xs font-mono font-semibold tabular-nums text-white mt-0.5">{val}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[var(--muted-foreground)] font-mono tabular-nums">
            Última:{" "}
            {new Date(latestMeasurement.measured_at).toLocaleDateString("pt-BR")}{" "}
            {new Date(latestMeasurement.measured_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {latestMeasurement.impedance_ohm
              ? " • bioimpedância OK"
              : " • sem bioimpedância"}
          </div>
        </>
      ) : (
        <div className="text-xs text-[var(--muted-foreground)] leading-relaxed">
          Nenhuma medição sincronizada ainda. Conecte via Bluetooth ou lance uma medição abaixo para cruzar com a curva projetada.
        </div>
      )}

      {/* Profile settings synced to Supabase */}
      <details className="text-xs border-t border-white/[0.06] pt-3">
        <summary className="cursor-pointer text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors tabular-nums">
          Perfil bioimpedância ({profile.height_cm} cm • {profile.age_years}a •{" "}
          {profile.sex === 1 ? "M" : "F"})
        </summary>
        <div className="flex flex-wrap items-end gap-2 pt-2.5">
          <label className="text-[10px] text-[var(--muted-foreground)]">
            Altura (cm)
            <input
              type="number"
              step={1}
              value={heightInput}
              onChange={(e) => setHeightInput(e.target.value)}
              className="input-field block w-20 h-8 rounded-lg px-2 text-xs font-mono tabular-nums mt-1"
            />
          </label>
          <label className="text-[10px] text-[var(--muted-foreground)]">
            Idade
            <input
              type="number"
              step={1}
              value={ageInput}
              onChange={(e) => setAgeInput(e.target.value)}
              className="input-field block w-16 h-8 rounded-lg px-2 text-xs font-mono tabular-nums mt-1"
            />
          </label>
          <label className="text-[10px] text-[var(--muted-foreground)]">
            Sexo
            <select
              value={sexInput}
              onChange={(e) => setSexInput(e.target.value)}
              className="input-field block h-8 rounded-lg px-2 text-xs mt-1"
            >
              <option value="1">Masculino</option>
              <option value="0">Feminino</option>
            </select>
          </label>
          <button
            type="button"
            disabled={savingProfile}
            onClick={() => void handleSaveProfileClick()}
            className="btn-press h-8 px-3 rounded-lg text-xs font-semibold bg-emerald-500 text-[#032014] hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
          >
            {savingProfile ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </details>

      {/* Manual bioimpedance fallback */}
      <details className="text-xs border-t border-white/[0.06] pt-3">
        <summary className="cursor-pointer text-[11px] font-medium text-sky-400 hover:text-sky-300 transition-colors">
          Registrar leitura manual (com impedância)
        </summary>
        <div className="flex flex-wrap items-end gap-2 pt-2.5">
          <label className="text-[10px] text-[var(--muted-foreground)]">
            Data
            <input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="input-field block h-8 rounded-lg px-2 text-xs font-mono tabular-nums mt-1"
            />
          </label>
          <label className="text-[10px] text-[var(--muted-foreground)]">
            Peso (kg)
            <input
              type="number"
              step="0.05"
              placeholder="86.10"
              value={manualWeight}
              onChange={(e) => setManualWeight(e.target.value)}
              className="input-field block w-24 h-8 rounded-lg px-2 text-xs font-mono tabular-nums mt-1"
            />
          </label>
          <label className="text-[10px] text-[var(--muted-foreground)]">
            Impedância (Ω)
            <input
              type="number"
              step="1"
              placeholder="Opcional"
              value={manualImpedance}
              onChange={(e) => setManualImpedance(e.target.value)}
              className="input-field block w-24 h-8 rounded-lg px-2 text-xs font-mono tabular-nums mt-1"
            />
          </label>
          <button
            type="button"
            disabled={syncing || !manualWeight}
            onClick={() => void handleManualScaleSubmit()}
            className="btn-press h-8 px-3 rounded-lg text-xs font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:opacity-50 cursor-pointer"
          >
            Salvar
          </button>
        </div>
      </details>

      {/* Scale History Table */}
      <details className="text-xs border-t border-white/[0.06] pt-3">
        <summary className="cursor-pointer text-[11px] font-medium text-slate-300 hover:text-white transition-colors tabular-nums">
          Histórico da balança ({scaleMeasurements.length})
        </summary>
        <div className="overflow-x-auto mt-2.5">
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              <tr>
                <th className="text-left py-1.5 font-medium">Data / Hora</th>
                <th className="text-left py-1.5 font-medium">Peso</th>
                <th className="text-left py-1.5 font-medium">Gord.</th>
                <th className="text-left py-1.5 font-medium">Músc.</th>
                <th className="text-right py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {scaleMeasurements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-2 font-sans text-[var(--muted-foreground)]">
                    Sem registros da balança ainda.
                  </td>
                </tr>
              ) : (
                scaleMeasurements.slice(0, 15).map((m) => {
                  const c = computeBodyComposition(Number(m.weight_kg), m.impedance_ohm, profile);
                  const d = new Date(m.measured_at);
                  const isFirst = firstOfDayIds.has(m.id);
                  return (
                    <tr key={m.id} className="border-t border-white/[0.06]">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-slate-200">
                        {d.toLocaleDateString("pt-BR")}{" "}
                        {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {isFirst ? (
                          <span
                            title="Primeira pesagem do dia (usada no gráfico Projetado × Realizado)"
                            className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold"
                          >
                            1ª
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-2 font-semibold text-white">{fmt(Number(m.weight_kg), 2)}</td>
                      <td className="py-1.5 pr-2 text-slate-300">
                        {c.body_fat_pct !== null ? `${fmt(c.body_fat_pct)}%` : "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-300">{c.muscle_kg !== null ? fmt(c.muscle_kg) : "—"}</td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => void onDeleteMeasurement(m.id)}
                          title="Excluir leitura"
                          className="btn-press text-rose-400/80 hover:text-rose-300 cursor-pointer px-1"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

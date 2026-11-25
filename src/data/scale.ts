import {
  daysBetweenISO,
  DEFAULT_CHECKPOINTS,
  formatFullDateBR,
  formatShortDateBR,
  getTodayBrazilISO,
  type UserSettingsDTO,
  type WeightLogDTO,
} from "./nutrition";

// Xiaomi Mi Body Composition Scale 2 (XMTZC05HM / "MIBFS") Web Bluetooth UUIDs
export const SVC_BODY_COMP = 0x181b;
export const CHR_BODY_COMP_MEAS = 0x2a9c;
export const CHR_HISTORY = "00002a2f-0000-3512-2118-0009af100700";
export const SVC_CURRENT_TIME = 0x1805;
export const CHR_CURRENT_TIME = 0x2a2b;

export interface ScaleProfile {
  height_cm: number;
  age_years: number;
  sex: 0 | 1; // 1 = masculino, 0 = feminino
}

export interface ParsedBleRecord {
  weight_kg: number;
  impedance_ohm: number | null;
  stabilized: boolean;
  removed: boolean;
  measured_at: Date;
}

export interface BodyComposition {
  bmi: number;
  body_fat_pct: number | null;
  fat_mass_kg: number | null;
  muscle_kg: number | null;
  water_pct: number | null;
  bone_kg: number | null;
  visceral_fat: number | null;
}

export interface ScaleMeasurementDTO {
  id: number;
  measured_at: string;
  measured_date: string;
  weight_kg: number;
  impedance_ohm: number | null;
  bmi: number | null;
  body_fat_pct: number | null;
  fat_mass_kg: number | null;
  muscle_kg: number | null;
  water_pct: number | null;
  bone_kg: number | null;
  visceral_fat: number | null;
  source: "ble-live" | "ble-history" | "manual" | "checkin";
}

export interface ProjectedPoint {
  date: string;
  label: string;
  fullDateBR: string;
  day: number;
  projectedKg: number;
  isCheckpoint: boolean;
}

export interface RealizedDayPoint {
  date: string;
  label: string;
  fullDateBR: string;
  day: number;
  realizedKg: number;
  projectedKg: number;
  deltaKg: number; // realizedKg - projectedKg (< 0 means ahead of target!)
  ewmaKg: number;
  source: "ble-live" | "ble-history" | "manual" | "checkin" | "checkpoint";
  readingsCount: number;
  measuredAt: string | null;
  impedanceOhm: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  fatMassKg: number | null;
  muscleKg: number | null;
  waterPct: number | null;
  boneKg: number | null;
  visceralFat: number | null;
  notes: string | null;
}

export interface ProjectedVsRealizedSeries {
  protocolStartDate: string;
  timelineStartDate: string;
  timelineEndDate: string;
  minDay: number;
  maxDay: number;
  projectedLine: ProjectedPoint[];
  projectedCheckpoints: ProjectedPoint[];
  realizedDaily: RealizedDayPoint[];
  todayISO: string;
  todayDay: number;
  projectedTodayKg: number;
  projectedFinalKg: number;
  latestRealized: RealizedDayPoint | null;
  weeklyRealRateKg: number | null;
}

export function toBrazilDateISO(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return getTodayBrazilISO();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDaysISO(baseISO: string, days: number): string {
  const dt = new Date(`${baseISO}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Parses a 13-byte Xiaomi Mi Body Composition Scale 2 BLE payload (openScale / xiaomi-ble format).
 */
export function parseScaleRecord(dv: DataView, offset = 0): ParsedBleRecord {
  const ctrl0 = dv.getUint8(offset);
  const ctrl1 = dv.getUint8(offset + 1);
  const isLbs = (ctrl0 & 0x01) !== 0;
  const isCatty = (ctrl1 & 0x40) !== 0;
  const hasImpedance = (ctrl1 & 0x02) !== 0;
  const stabilized = (ctrl1 & 0x20) !== 0;
  const removed = (ctrl1 & 0x80) !== 0;

  const year = dv.getUint16(offset + 2, true);
  const month = dv.getUint8(offset + 4);
  const day = dv.getUint8(offset + 5);
  const hour = dv.getUint8(offset + 6);
  const minute = dv.getUint8(offset + 7);
  const second = dv.getUint8(offset + 8);
  const parsedDate = new Date(year, month - 1, day, hour, minute, second);

  const impedance = dv.getUint16(offset + 9, true);
  const rawWeight = dv.getUint16(offset + 11, true);

  let weight: number;
  if (isLbs) weight = (rawWeight / 100) * 0.45359237;
  else if (isCatty) weight = (rawWeight / 100) * 0.5;
  else weight = rawWeight / 200;

  return {
    weight_kg: Math.round(weight * 100) / 100,
    impedance_ohm: hasImpedance && impedance > 0 && impedance < 3000 ? impedance : null,
    stabilized,
    removed,
    measured_at: year > 2000 && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date(),
  };
}

/**
 * MiScaleLib (openScale / Zepp Life) body composition formulas.
 */
export function computeBodyComposition(
  weight: number,
  impedance: number | null,
  profile: ScaleProfile
): BodyComposition {
  const h = profile.height_cm || 181;
  const age = profile.age_years || 33;
  const sex = profile.sex === 0 ? 0 : 1;

  const bmi = Number((weight / ((h / 100) * (h / 100))).toFixed(1));
  if (!impedance || impedance <= 0 || impedance >= 3000) {
    return {
      bmi,
      body_fat_pct: null,
      fat_mass_kg: null,
      muscle_kg: null,
      water_pct: null,
      bone_kg: null,
      visceral_fat: null,
    };
  }

  const lbmCoeff =
    ((h * 9.058) / 100) * (h / 100) + weight * 0.32 + 12.226 - impedance * 0.0068 - age * 0.0542;

  let lbmSub = 0.8;
  if (sex === 0) lbmSub = age <= 49 ? 9.25 : 7.25;

  let coeff = 1.0;
  if (sex === 1 && weight < 61) coeff = 0.98;
  else if (sex === 0 && weight > 60) {
    coeff = 0.96;
    if (h > 160) coeff *= 1.03;
  } else if (sex === 0 && weight < 50) {
    coeff = 1.02;
    if (h > 160) coeff *= 1.03;
  }

  let fat = (1 - ((lbmCoeff - lbmSub) * coeff) / weight) * 100;
  if (fat > 63) fat = 75;
  fat = Math.max(3, Math.min(75, fat));

  let bone = (sex === 0 ? 0.245691014 : 0.18016894) - lbmCoeff * 0.05158;
  bone = -bone;
  bone = bone > 2.2 ? bone + 0.1 : bone - 0.1;
  if ((sex === 0 && bone > 5.1) || (sex === 1 && bone > 5.2)) bone = 8.0;
  bone = Math.max(0.5, bone);

  let water = (100 - fat) * 0.7;
  water = water * (water < 50 ? 1.02 : 0.98);

  const fatMass = (fat / 100) * weight;
  const muscle = Math.max(0, weight - fatMass - bone);

  let visceral: number;
  if (sex === 1) {
    if (h < weight * 1.6) {
      const sub = -(h * 0.4 - h * (h * 0.0826));
      visceral = (weight * 305) / (sub + 48) - 2.9 + age * 0.15;
    } else {
      const sub = 0.765 + h * -0.0015;
      visceral = -(h * 0.143 - weight * sub) + age * 0.15 - 5.0;
    }
  } else {
    if (weight > -(13 - h * 0.5)) {
      const subsub = h * 1.45 + h * 0.1158 * h - 120;
      visceral = (weight * 500) / subsub - 6 + age * 0.07;
    } else {
      const sub = 0.691 + h * -0.0024 + h * -0.0024;
      visceral = -(h * 0.027 - sub * weight) + age * 0.07 - age;
    }
  }

  return {
    bmi,
    body_fat_pct: Number(fat.toFixed(1)),
    fat_mass_kg: Number(fatMass.toFixed(2)),
    muscle_kg: Number(muscle.toFixed(2)),
    water_pct: Number(water.toFixed(1)),
    bone_kg: Number(bone.toFixed(2)),
    visceral_fat: Number(Math.max(1, visceral).toFixed(1)),
  };
}

export function projectedWeightForDay(startWeightKg: number, simDeficit: number, day: number): number {
  const loss = (simDeficit * Math.max(0, day)) / 7700.0;
  return Math.round((startWeightKg - loss) * 100) / 100;
}

/**
 * Crosses day-by-day realized measurements (preferring the FIRST Xiaomi scale measurement of each day)
 * against the continuous Projected weight curve driven by simDeficit.
 */
export function buildProjectedVsRealizedSeries(params: {
  weights: WeightLogDTO[];
  scaleMeasurements: ScaleMeasurementDTO[];
  simDeficit: number;
  settings: UserSettingsDTO;
}): ProjectedVsRealizedSeries {
  const { weights, scaleMeasurements, simDeficit, settings } = params;
  const startWeightKg = Number(settings.start_weight_kg);
  const protocolStartDate = settings.protocol_start_date;
  const protocolEndDate = settings.protocol_end_date;
  const profile: ScaleProfile = {
    height_cm: settings.height_cm ?? 181,
    age_years: settings.age_years ?? 33,
    sex: settings.sex === 0 ? 0 : 1,
  };

  // Group scale measurements by measured_date, sorted by measured_at ASC -> pick FIRST of day (jejum)
  const scaleByDate = new Map<string, ScaleMeasurementDTO[]>();
  const sortedScale = [...scaleMeasurements].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  for (const m of sortedScale) {
    const arr = scaleByDate.get(m.measured_date) ?? [];
    arr.push(m);
    scaleByDate.set(m.measured_date, arr);
  }

  // Group non-projected weight_logs by recorded_date
  const realWeightByDate = new Map<string, WeightLogDTO>();
  for (const w of weights) {
    if (!w.is_projected) {
      realWeightByDate.set(w.recorded_date, w);
    }
  }

  // Collect all unique realized dates
  const realizedDatesSet = new Set<string>([
    ...scaleByDate.keys(),
    ...realWeightByDate.keys(),
  ]);
  const realizedDates = Array.from(realizedDatesSet).sort((a, b) => a.localeCompare(b));

  // Build realizedDaily with time-aware EWMA (alpha = 0.15 / day)
  const alphaDay = 0.15;
  let prevEwma: number | null = null;
  let prevDay = 0;

  const realizedDaily: RealizedDayPoint[] = realizedDates.map((date, idx) => {
    const day = daysBetweenISO(protocolStartDate, date);
    const projectedKg = projectedWeightForDay(startWeightKg, simDeficit, day);
    const dayScaleList = scaleByDate.get(date);
    const firstScale = dayScaleList?.[0] ?? null;
    const manualWeight = realWeightByDate.get(date) ?? null;

    let realizedKg: number;
    let source: RealizedDayPoint["source"];
    let readingsCount = 1;
    let measuredAt: string | null = null;
    let impedanceOhm: number | null = null;
    let bmi: number | null = null;
    let bodyFatPct: number | null = null;
    let fatMassKg: number | null = null;
    let muscleKg: number | null = null;
    let waterPct: number | null = null;
    let boneKg: number | null = null;
    let visceralFat: number | null = null;
    let notes: string | null = null;

    if (firstScale) {
      realizedKg = Number(firstScale.weight_kg);
      source = firstScale.source;
      readingsCount = dayScaleList!.length;
      measuredAt = firstScale.measured_at;
      impedanceOhm = firstScale.impedance_ohm;
      const comp = computeBodyComposition(realizedKg, impedanceOhm, profile);
      bmi = comp.bmi;
      bodyFatPct = comp.body_fat_pct;
      fatMassKg = comp.fat_mass_kg;
      muscleKg = comp.muscle_kg;
      waterPct = comp.water_pct;
      boneKg = comp.bone_kg;
      visceralFat = comp.visceral_fat;
      notes =
        readingsCount > 1
          ? `1ª pesagem do dia (${readingsCount} leituras na balança)`
          : "Sincronizado via balança Xiaomi";
    } else {
      realizedKg = Number(manualWeight!.weight_kg);
      source =
        manualWeight!.source === "checkin"
          ? "checkin"
          : manualWeight!.source === "checkpoint"
            ? "checkpoint"
            : "manual";
      notes = manualWeight!.notes;
    }

    const gapDays = idx === 0 ? 0 : Math.max(1, day - prevDay);
    prevDay = day;
    const stepAlpha = idx === 0 ? 1 : 1 - Math.pow(1 - alphaDay, gapDays);
    const ewmaVal: number = prevEwma === null ? realizedKg : prevEwma + stepAlpha * (realizedKg - prevEwma);
    prevEwma = ewmaVal;

    const deltaKg = Math.round((realizedKg - projectedKg) * 100) / 100;

    return {
      date,
      label: formatShortDateBR(date),
      fullDateBR: formatFullDateBR(date),
      day,
      realizedKg: Math.round(realizedKg * 100) / 100,
      projectedKg,
      deltaKg,
      ewmaKg: Math.round(ewmaVal * 100) / 100,
      source,
      readingsCount,
      measuredAt,
      impedanceOhm,
      bmi,
      bodyFatPct,
      fatMassKg,
      muscleKg,
      waterPct,
      boneKg,
      visceralFat,
      notes,
    };
  });

  // Determine timeline bounds (at least protocolStartDate..protocolEndDate, extending if real weigh-ins go further)
  const earliestReal = realizedDates[0];
  const latestReal = realizedDates[realizedDates.length - 1];
  const timelineStartDate =
    earliestReal && earliestReal < protocolStartDate ? earliestReal : protocolStartDate;
  const timelineEndDate =
    latestReal && latestReal > protocolEndDate ? latestReal : protocolEndDate;

  const minDay = daysBetweenISO(protocolStartDate, timelineStartDate);
  const maxDay = Math.max(minDay + 7, daysBetweenISO(protocolStartDate, timelineEndDate));

  const checkpointDates = new Set(DEFAULT_CHECKPOINTS.map((c) => c.recorded_date));

  const projectedCheckpoints: ProjectedPoint[] = DEFAULT_CHECKPOINTS.map((cp) => {
    const day = daysBetweenISO(protocolStartDate, cp.recorded_date);
    return {
      date: cp.recorded_date,
      label: formatShortDateBR(cp.recorded_date),
      fullDateBR: formatFullDateBR(cp.recorded_date),
      day,
      projectedKg: projectedWeightForDay(startWeightKg, simDeficit, day),
      isCheckpoint: true,
    };
  });

  // Continuous day-by-day projected series across the entire timeline
  const projectedLine: ProjectedPoint[] = [];
  for (let d = minDay; d <= maxDay; d++) {
    const iso = addDaysISO(protocolStartDate, d);
    projectedLine.push({
      date: iso,
      label: formatShortDateBR(iso),
      fullDateBR: formatFullDateBR(iso),
      day: d,
      projectedKg: projectedWeightForDay(startWeightKg, simDeficit, d),
      isCheckpoint: checkpointDates.has(iso),
    });
  }

  const todayISO = getTodayBrazilISO();
  const todayDay = Math.max(0, daysBetweenISO(protocolStartDate, todayISO));
  const projectedTodayKg = projectedWeightForDay(startWeightKg, simDeficit, todayDay);
  const protocolEndDay = Math.max(1, daysBetweenISO(protocolStartDate, protocolEndDate));
  const projectedFinalKg = projectedWeightForDay(startWeightKg, simDeficit, protocolEndDay);

  const latestRealized = realizedDaily.length > 0 ? realizedDaily[realizedDaily.length - 1] : null;
  let weeklyRealRateKg: number | null = null;
  if (realizedDaily.length >= 2) {
    const firstR = realizedDaily[0];
    const lastR = realizedDaily[realizedDaily.length - 1];
    const spanDays = lastR.day - firstR.day;
    if (spanDays >= 1) {
      weeklyRealRateKg = Math.round((((lastR.ewmaKg - firstR.ewmaKg) / spanDays) * 7) * 100) / 100;
    }
  }

  return {
    protocolStartDate,
    timelineStartDate,
    timelineEndDate,
    minDay,
    maxDay,
    projectedLine,
    projectedCheckpoints,
    realizedDaily,
    todayISO,
    todayDay,
    projectedTodayKg,
    projectedFinalKg,
    latestRealized,
    weeklyRealRateKg,
  };
}

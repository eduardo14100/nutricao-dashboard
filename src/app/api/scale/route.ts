import { metric } from "@vercel/functions";
import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";
import { getAuthedContext } from "@/lib/supabase";
import {
  computeBodyComposition,
  toBrazilDateISO,
  type ScaleMeasurementDTO,
  type ScaleProfile,
} from "@/data/scale";

interface IncomingScaleMeasurement {
  measured_at?: string;
  weight_kg?: number;
  impedance_ohm?: number | null;
  source?: "ble-live" | "ble-history" | "manual" | "checkin";
}

export async function GET() {
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { data, error } = await ctx.supabase
      .from("scale_measurements")
      .select(
        "id, measured_at, measured_date, weight_kg, impedance_ohm, bmi, body_fat_pct, fat_mass_kg, muscle_kg, water_pct, bone_kg, visceral_fat, source"
      )
      .eq("user_id", ctx.userId)
      .order("measured_at", { ascending: false })
      .limit(365);

    if (error) {
      return NextResponse.json({ error: "Erro ao buscar medições da balança." }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true, scaleMeasurements: data ?? [] });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch (err) {
    console.error("Scale GET error:", err);
    return NextResponse.json({ error: "Erro interno ao listar medições." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = (await request.json()) as {
      measurements?: IncomingScaleMeasurement[];
      measurement?: IncomingScaleMeasurement;
    };

    const incomingRaw = body.measurements ?? (body.measurement ? [body.measurement] : []);
    if (!Array.isArray(incomingRaw) || incomingRaw.length === 0) {
      return NextResponse.json({ error: "Nenhuma medição enviada." }, { status: 400 });
    }

    const [settingsRes, existingRes] = await Promise.all([
      ctx.supabase
        .from("user_settings")
        .select("height_cm, age_years, sex")
        .eq("user_id", ctx.userId)
        .single(),
      ctx.supabase
        .from("scale_measurements")
        .select("id, measured_at, measured_date, weight_kg, impedance_ohm")
        .eq("user_id", ctx.userId)
        .order("measured_at", { ascending: false })
        .limit(500),
    ]);

    if (settingsRes.error) {
      metric("scale.sync", 1, { outcome: "error" });
      return NextResponse.json({ error: "Erro ao carregar perfil corporal." }, { status: 500 });
    }

    const profile: ScaleProfile = {
      height_cm: settingsRes.data?.height_cm ?? 181,
      age_years: settingsRes.data?.age_years ?? 33,
      sex: settingsRes.data?.sex === 0 ? 0 : 1,
    };

    const existingList = (existingRes.data ?? []).map((e) => ({
      ts: new Date(e.measured_at).getTime(),
      weight: Number(e.weight_kg),
    }));

    const rowsToInsert: Array<Record<string, unknown>> = [];
    const affectedDates = new Set<string>();

    for (const item of incomingRaw) {
      const weightKg = Number(Number(item.weight_kg).toFixed(2));
      if (Number.isNaN(weightKg) || weightKg < 20 || weightKg > 250) continue;

      const measuredAtDate = item.measured_at ? new Date(item.measured_at) : new Date();
      if (Number.isNaN(measuredAtDate.getTime())) continue;
      const ts = measuredAtDate.getTime();

      // Deduplicate against existing DB entries AND within current batch (±90s and ±0.15 kg)
      const isDuplicate = existingList.some(
        (m) => Math.abs(m.ts - ts) < 90_000 && Math.abs(m.weight - weightKg) < 0.15
      );
      if (isDuplicate) continue;

      existingList.push({ ts, weight: weightKg });

      const impedance =
        item.impedance_ohm !== null &&
        item.impedance_ohm !== undefined &&
        Number(item.impedance_ohm) > 0 &&
        Number(item.impedance_ohm) < 3000
          ? Math.round(Number(item.impedance_ohm))
          : null;

      const comp = computeBodyComposition(weightKg, impedance, profile);
      const measuredDate = toBrazilDateISO(measuredAtDate);
      const source =
        item.source === "ble-history" || item.source === "manual" || item.source === "checkin"
          ? item.source
          : "ble-live";

      rowsToInsert.push({
        user_id: ctx.userId,
        measured_at: measuredAtDate.toISOString(),
        measured_date: measuredDate,
        weight_kg: weightKg,
        impedance_ohm: impedance,
        bmi: comp.bmi,
        body_fat_pct: comp.body_fat_pct,
        fat_mass_kg: comp.fat_mass_kg,
        muscle_kg: comp.muscle_kg,
        water_pct: comp.water_pct,
        bone_kg: comp.bone_kg,
        visceral_fat: comp.visceral_fat,
        source,
      });
      affectedDates.add(measuredDate);
    }

    if (rowsToInsert.length > 0) {
      const { error: insErr } = await ctx.supabase
        .from("scale_measurements")
        .insert(rowsToInsert);

      if (insErr) {
        console.error("Scale insert error:", insErr);
        metric("scale.sync", 1, { outcome: "error" });
        return NextResponse.json({ error: "Erro ao gravar medições da balança." }, { status: 500 });
      }

      // Sync FIRST measurement of each affected date (jejum) into weight_logs for consistent daily realized history
      const dateArray = Array.from(affectedDates);
      const { data: dayRows } = await ctx.supabase
        .from("scale_measurements")
        .select("measured_date, measured_at, weight_kg")
        .eq("user_id", ctx.userId)
        .in("measured_date", dateArray)
        .order("measured_at", { ascending: true });

      const firstPerDate = new Map<string, { weight_kg: number; count: number }>();
      for (const r of dayRows ?? []) {
        const cur = firstPerDate.get(r.measured_date);
        if (!cur) {
          firstPerDate.set(r.measured_date, { weight_kg: Number(r.weight_kg), count: 1 });
        } else {
          cur.count += 1;
        }
      }

      const weightUpserts = Array.from(firstPerDate.entries()).map(([recorded_date, info]) => ({
        user_id: ctx.userId,
        recorded_date,
        weight_kg: info.weight_kg,
        source: "manual",
        is_projected: false,
        notes:
          info.count > 1
            ? `Balança Xiaomi (1ª pesagem do dia • ${info.count} leituras)`
            : "Balança Xiaomi (BLE)",
      }));

      if (weightUpserts.length > 0) {
        await ctx.supabase
          .from("weight_logs")
          .upsert(weightUpserts, { onConflict: "user_id,recorded_date" });
      }
    }

    const [updatedScaleRes, updatedWeightsRes] = await Promise.all([
      ctx.supabase
        .from("scale_measurements")
        .select(
          "id, measured_at, measured_date, weight_kg, impedance_ohm, bmi, body_fat_pct, fat_mass_kg, muscle_kg, water_pct, bone_kg, visceral_fat, source"
        )
        .eq("user_id", ctx.userId)
        .order("measured_at", { ascending: false })
        .limit(365),
      ctx.supabase
        .from("weight_logs")
        .select("id, recorded_date, weight_kg, source, is_projected, notes")
        .eq("user_id", ctx.userId)
        .order("recorded_date", { ascending: true }),
    ]);

    const res = NextResponse.json({
      ok: true,
      insertedCount: rowsToInsert.length,
      scaleMeasurements: (updatedScaleRes.data ?? []) as ScaleMeasurementDTO[],
      weights: updatedWeightsRes.data ?? [],
    });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    metric("scale.sync", 1, { outcome: "success" });
    return res;
  } catch (err) {
    console.error("Scale POST error:", err);
    metric("scale.sync", 1, { outcome: "error" });
    return NextResponse.json({ error: "Erro interno ao sincronizar balança." }, { status: 500 });
  } finally {
    metric("scale.sync.duration_ms", performance.now() - startedAt);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID de medição inválido." }, { status: 400 });
    }

    const { data: target, error: findErr } = await ctx.supabase
      .from("scale_measurements")
      .select("id, measured_date")
      .eq("user_id", ctx.userId)
      .eq("id", id)
      .maybeSingle();

    if (findErr || !target) {
      return NextResponse.json({ error: "Medição não encontrada." }, { status: 404 });
    }

    const { error: delErr } = await ctx.supabase
      .from("scale_measurements")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("id", id);

    if (delErr) {
      return NextResponse.json({ error: "Erro ao remover medição." }, { status: 500 });
    }

    // Reconcile weight_logs for that measured_date
    const { data: remaining } = await ctx.supabase
      .from("scale_measurements")
      .select("weight_kg, measured_at")
      .eq("user_id", ctx.userId)
      .eq("measured_date", target.measured_date)
      .order("measured_at", { ascending: true });

    if (remaining && remaining.length > 0) {
      await ctx.supabase.from("weight_logs").upsert(
        {
          user_id: ctx.userId,
          recorded_date: target.measured_date,
          weight_kg: Number(remaining[0].weight_kg),
          source: "manual",
          is_projected: false,
          notes:
            remaining.length > 1
              ? `Balança Xiaomi (1ª pesagem do dia • ${remaining.length} leituras)`
              : "Balança Xiaomi (BLE)",
        },
        { onConflict: "user_id,recorded_date" }
      );
    } else {
      // Remove only if weight_logs entry came from the scale
      const { data: wl } = await ctx.supabase
        .from("weight_logs")
        .select("id, notes")
        .eq("user_id", ctx.userId)
        .eq("recorded_date", target.measured_date)
        .maybeSingle();

      if (wl && typeof wl.notes === "string" && wl.notes.startsWith("Balança Xiaomi")) {
        await ctx.supabase.from("weight_logs").delete().eq("id", wl.id);
      }
    }

    const [updatedScaleRes, updatedWeightsRes] = await Promise.all([
      ctx.supabase
        .from("scale_measurements")
        .select(
          "id, measured_at, measured_date, weight_kg, impedance_ohm, bmi, body_fat_pct, fat_mass_kg, muscle_kg, water_pct, bone_kg, visceral_fat, source"
        )
        .eq("user_id", ctx.userId)
        .order("measured_at", { ascending: false })
        .limit(365),
      ctx.supabase
        .from("weight_logs")
        .select("id, recorded_date, weight_kg, source, is_projected, notes")
        .eq("user_id", ctx.userId)
        .order("recorded_date", { ascending: true }),
    ]);

    const res = NextResponse.json({
      ok: true,
      scaleMeasurements: updatedScaleRes.data ?? [],
      weights: updatedWeightsRes.data ?? [],
    });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch (err) {
    console.error("Scale DELETE error:", err);
    return NextResponse.json({ error: "Erro interno ao remover medição." }, { status: 500 });
  }
}

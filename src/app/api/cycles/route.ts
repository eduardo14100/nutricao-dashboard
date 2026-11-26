import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";
import { getAuthedContext } from "@/lib/supabase";
import { formatShortDateBR, type ProtocolCycleDTO } from "@/data/nutrition";

const SETTINGS_SELECT =
  "sim_deficit, tmb_kcal, get_kcal, calorie_goal, protein_goal, carb_goal, fat_goal, fiber_goal, sodium_limit, water_goal_ml, start_weight_kg, target_weight_min_kg, target_weight_max_kg, protocol_start_date, protocol_end_date, height_cm, age_years, sex, scale_user_id";

const CYCLE_SELECT =
  "id, name, start_date, end_date, start_weight_kg, target_weight_min_kg, target_weight_max_kg, sim_deficit, final_weight_kg, is_active, notes, created_at";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultCycleName(startDate: string, endDate: string): string {
  const year = endDate.slice(0, 4);
  return `Ciclo ${formatShortDateBR(startDate)} a ${formatShortDateBR(endDate)}/${year}`;
}

export async function GET() {
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { data, error } = await ctx.supabase
      .from("protocol_cycles")
      .select(CYCLE_SELECT)
      .eq("user_id", ctx.userId)
      .order("start_date", { ascending: false });

    const res = NextResponse.json({
      ok: true,
      cycles: error ? [] : ((data ?? []) as ProtocolCycleDTO[]),
      historyAvailable: !error,
    });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch (err) {
    console.error("Cycles GET error:", err);
    return NextResponse.json({ error: "Erro ao carregar histórico de ciclos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = (await request.json()) as {
      mode?: "new" | "edit";
      name?: string;
      start_date?: string;
      end_date?: string;
      start_weight_kg?: number;
      target_weight_min_kg?: number;
      target_weight_max_kg?: number;
      sim_deficit?: number;
      update_calorie_goal?: boolean;
      notes?: string | null;
    };

    const mode = body.mode === "edit" ? "edit" : "new";
    const startDate = String(body.start_date ?? "").trim();
    const endDate = String(body.end_date ?? "").trim();

    if (!ISO_RE.test(startDate) || !ISO_RE.test(endDate)) {
      return NextResponse.json({ error: "Informe datas válidas de início e término." }, { status: 400 });
    }
    if (endDate <= startDate) {
      return NextResponse.json({ error: "A data final deve ser posterior à data inicial." }, { status: 400 });
    }

    const startWeight = Number(Number(body.start_weight_kg).toFixed(1));
    const targetMin = Number(Number(body.target_weight_min_kg).toFixed(1));
    const targetMax = Number(Number(body.target_weight_max_kg).toFixed(1));
    const simDeficit = Math.round(Number(body.sim_deficit));

    if (Number.isNaN(startWeight) || startWeight < 35 || startWeight > 250) {
      return NextResponse.json({ error: "Peso inicial deve estar entre 35 e 250 kg." }, { status: 400 });
    }
    if (
      Number.isNaN(targetMin) ||
      Number.isNaN(targetMax) ||
      targetMin < 35 ||
      targetMax > 250 ||
      targetMin > targetMax
    ) {
      return NextResponse.json({ error: "Faixa alvo inválida (mínimo deve ser menor ou igual ao máximo)." }, { status: 400 });
    }
    if (Number.isNaN(simDeficit) || simDeficit < 100 || simDeficit > 1500) {
      return NextResponse.json({ error: "Déficit deve estar entre 100 e 1500 kcal/dia." }, { status: 400 });
    }

    const cycleName = (body.name ?? "").trim() || defaultCycleName(startDate, endDate);
    const notes = (body.notes ?? "").trim() || null;

    // 1) Read current settings so we can archive the previous cycle accurately
    const { data: prevSettings, error: prevErr } = await ctx.supabase
      .from("user_settings")
      .select(SETTINGS_SELECT)
      .eq("user_id", ctx.userId)
      .single();

    if (prevErr || !prevSettings) {
      return NextResponse.json({ error: "Erro ao consultar protocolo atual." }, { status: 500 });
    }

    // 2) Update user_settings (always works, even if protocol_cycles migration wasn't run yet)
    const settingsPatch: Record<string, string | number> = {
      protocol_start_date: startDate,
      protocol_end_date: endDate,
      start_weight_kg: startWeight,
      target_weight_min_kg: targetMin,
      target_weight_max_kg: targetMax,
      sim_deficit: simDeficit,
    };
    if (body.update_calorie_goal && typeof prevSettings.get_kcal === "number") {
      settingsPatch.calorie_goal = Math.max(1200, Math.round(prevSettings.get_kcal - simDeficit));
    }

    const { data: updatedSettings, error: updateErr } = await ctx.supabase
      .from("user_settings")
      .update(settingsPatch)
      .eq("user_id", ctx.userId)
      .select(SETTINGS_SELECT)
      .single();

    if (updateErr || !updatedSettings) {
      return NextResponse.json({ error: "Erro ao salvar protocolo em user_settings." }, { status: 500 });
    }

    // 3) Sync Day 0 checkpoint in weight_logs without clobbering an actual scale/checkin/manual weigh-in
    const { data: existingDay0 } = await ctx.supabase
      .from("weight_logs")
      .select("id, source, is_projected")
      .eq("user_id", ctx.userId)
      .eq("recorded_date", startDate)
      .maybeSingle();

    if (!existingDay0 || existingDay0.is_projected || existingDay0.source === "checkpoint") {
      await ctx.supabase.from("weight_logs").upsert(
        {
          user_id: ctx.userId,
          recorded_date: startDate,
          weight_kg: startWeight,
          source: "checkpoint",
          is_projected: false,
          notes: `Início: ${cycleName}`,
        },
        { onConflict: "user_id,recorded_date" }
      );
    }

    // 4) Persist cycle history in protocol_cycles (graceful fallback if migration not yet applied)
    let cycles: ProtocolCycleDTO[] = [];
    let historyAvailable = true;

    const existingCyclesRes = await ctx.supabase
      .from("protocol_cycles")
      .select(CYCLE_SELECT)
      .eq("user_id", ctx.userId)
      .order("start_date", { ascending: false });

    if (existingCyclesRes.error) {
      console.warn("[cycles] Tabela protocol_cycles indisponível (migração aplicada?):", existingCyclesRes.error.message);
      historyAvailable = false;
    } else {
      const existingCycles = (existingCyclesRes.data ?? []) as ProtocolCycleDTO[];
      const activeRow = existingCycles.find((c) => c.is_active) ?? null;

      if (mode === "new") {
        // Find the last realized weight during the previous cycle for archival summary
        const prevStart = String(prevSettings.protocol_start_date);
        const prevEnd = String(prevSettings.protocol_end_date);
        const [{ data: lastScale }, { data: lastWeight }] = await Promise.all([
          ctx.supabase
            .from("scale_measurements")
            .select("weight_kg, measured_date")
            .eq("user_id", ctx.userId)
            .gte("measured_date", prevStart)
            .lte("measured_date", prevEnd)
            .order("measured_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          ctx.supabase
            .from("weight_logs")
            .select("weight_kg, recorded_date")
            .eq("user_id", ctx.userId)
            .eq("is_projected", false)
            .gte("recorded_date", prevStart)
            .lte("recorded_date", prevEnd)
            .order("recorded_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        let prevFinalWeight: number | null = null;
        if (lastScale && lastWeight) {
          prevFinalWeight =
            lastScale.measured_date >= lastWeight.recorded_date
              ? Number(lastScale.weight_kg)
              : Number(lastWeight.weight_kg);
        } else if (lastScale) {
          prevFinalWeight = Number(lastScale.weight_kg);
        } else if (lastWeight) {
          prevFinalWeight = Number(lastWeight.weight_kg);
        }

        if (activeRow) {
          await ctx.supabase
            .from("protocol_cycles")
            .update({
              is_active: false,
              final_weight_kg: prevFinalWeight,
              updated_at: new Date().toISOString(),
            })
            .eq("id", activeRow.id);
        } else {
          // Snapshot the original implicit cycle (from user_settings) before starting the new one
          await ctx.supabase.from("protocol_cycles").insert({
            user_id: ctx.userId,
            name: defaultCycleName(prevStart, prevEnd),
            start_date: prevStart,
            end_date: prevEnd,
            start_weight_kg: Number(prevSettings.start_weight_kg),
            target_weight_min_kg: Number(prevSettings.target_weight_min_kg),
            target_weight_max_kg: Number(prevSettings.target_weight_max_kg),
            sim_deficit: Number(prevSettings.sim_deficit) || 530,
            final_weight_kg: prevFinalWeight,
            is_active: false,
            notes: "Ciclo arquivado automaticamente ao iniciar novo protocolo",
          });
        }

        await ctx.supabase.from("protocol_cycles").insert({
          user_id: ctx.userId,
          name: cycleName,
          start_date: startDate,
          end_date: endDate,
          start_weight_kg: startWeight,
          target_weight_min_kg: targetMin,
          target_weight_max_kg: targetMax,
          sim_deficit: simDeficit,
          is_active: true,
          notes,
        });
      } else {
        // mode === "edit": update active cycle row (or insert one if none existed yet)
        if (activeRow) {
          await ctx.supabase
            .from("protocol_cycles")
            .update({
              name: cycleName,
              start_date: startDate,
              end_date: endDate,
              start_weight_kg: startWeight,
              target_weight_min_kg: targetMin,
              target_weight_max_kg: targetMax,
              sim_deficit: simDeficit,
              notes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", activeRow.id);
        } else {
          await ctx.supabase.from("protocol_cycles").insert({
            user_id: ctx.userId,
            name: cycleName,
            start_date: startDate,
            end_date: endDate,
            start_weight_kg: startWeight,
            target_weight_min_kg: targetMin,
            target_weight_max_kg: targetMax,
            sim_deficit: simDeficit,
            is_active: true,
            notes,
          });
        }
      }

      const refreshed = await ctx.supabase
        .from("protocol_cycles")
        .select(CYCLE_SELECT)
        .eq("user_id", ctx.userId)
        .order("start_date", { ascending: false });
      cycles = (refreshed.data ?? []) as ProtocolCycleDTO[];
    }

    const { data: weights } = await ctx.supabase
      .from("weight_logs")
      .select("id, recorded_date, weight_kg, source, is_projected, notes")
      .eq("user_id", ctx.userId)
      .order("recorded_date", { ascending: true });

    const res = NextResponse.json({
      ok: true,
      settings: updatedSettings,
      weights: weights ?? [],
      cycles,
      historyAvailable,
    });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch (err) {
    console.error("Cycles POST error:", err);
    return NextResponse.json({ error: "Erro interno ao salvar ciclo." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID de ciclo inválido." }, { status: 400 });
    }

    const { error } = await ctx.supabase
      .from("protocol_cycles")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("id", id)
      .eq("is_active", false);

    if (error) {
      return NextResponse.json({ error: "Não foi possível remover este ciclo." }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch (err) {
    console.error("Cycles DELETE error:", err);
    return NextResponse.json({ error: "Erro interno ao remover ciclo." }, { status: 500 });
  }
}

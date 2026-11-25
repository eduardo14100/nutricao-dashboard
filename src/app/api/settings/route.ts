import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";
import { getAuthedContext } from "@/lib/supabase";
import { computeBodyComposition, type ScaleProfile } from "@/data/scale";

const SETTINGS_SELECT =
  "sim_deficit, tmb_kcal, get_kcal, calorie_goal, protein_goal, carb_goal, fat_goal, fiber_goal, sodium_limit, water_goal_ml, start_weight_kg, target_weight_min_kg, target_weight_max_kg, protocol_start_date, protocol_end_date, height_cm, age_years, sex, scale_user_id";

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthedContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = (await request.json()) as {
      sim_deficit?: number;
      height_cm?: number;
      age_years?: number;
      sex?: number;
      scale_user_id?: number;
    };

    const patch: Record<string, number> = {};

    if (body.sim_deficit !== undefined) {
      const deficit = Math.round(Number(body.sim_deficit));
      if (Number.isNaN(deficit) || deficit < 100 || deficit > 1500) {
        return NextResponse.json({ error: "Déficit deve estar entre 100 e 1500 kcal." }, { status: 400 });
      }
      patch.sim_deficit = deficit;
    }

    let profileChanged = false;
    if (body.height_cm !== undefined) {
      const h = Math.round(Number(body.height_cm));
      if (Number.isNaN(h) || h < 100 || h > 250) {
        return NextResponse.json({ error: "Altura deve estar entre 100 e 250 cm." }, { status: 400 });
      }
      patch.height_cm = h;
      profileChanged = true;
    }

    if (body.age_years !== undefined) {
      const age = Math.round(Number(body.age_years));
      if (Number.isNaN(age) || age < 10 || age > 110) {
        return NextResponse.json({ error: "Idade deve estar entre 10 e 110 anos." }, { status: 400 });
      }
      patch.age_years = age;
      profileChanged = true;
    }

    if (body.sex !== undefined) {
      const sex = Number(body.sex) === 0 ? 0 : 1;
      patch.sex = sex;
      profileChanged = true;
    }

    if (body.scale_user_id !== undefined) {
      const uid = Math.round(Number(body.scale_user_id));
      if (!Number.isNaN(uid) && uid > 0 && uid <= 65535) {
        patch.scale_user_id = uid;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nenhum campo válido para atualizar." }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("user_settings")
      .update(patch)
      .eq("user_id", ctx.userId)
      .select(SETTINGS_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Erro ao atualizar configurações." }, { status: 500 });
    }

    // Recompute stored bioimpedance metrics when body profile changes
    if (profileChanged) {
      const profile: ScaleProfile = {
        height_cm: data.height_cm,
        age_years: data.age_years,
        sex: data.sex === 0 ? 0 : 1,
      };
      const { data: measurements } = await ctx.supabase
        .from("scale_measurements")
        .select("id, weight_kg, impedance_ohm")
        .eq("user_id", ctx.userId);

      if (measurements && measurements.length > 0) {
        await Promise.all(
          measurements.map((m) => {
            const comp = computeBodyComposition(Number(m.weight_kg), m.impedance_ohm, profile);
            return ctx.supabase
              .from("scale_measurements")
              .update({
                bmi: comp.bmi,
                body_fat_pct: comp.body_fat_pct,
                fat_mass_kg: comp.fat_mass_kg,
                muscle_kg: comp.muscle_kg,
                water_pct: comp.water_pct,
                bone_kg: comp.bone_kg,
                visceral_fat: comp.visceral_fat,
              })
              .eq("id", m.id);
          })
        );
      }
    }

    const res = NextResponse.json({ ok: true, settings: data });
    if (ctx.refreshedSession) attachSessionCookie(res, ctx.refreshedSession);
    return res;
  } catch (err) {
    console.error("Settings PATCH error:", err);
    return NextResponse.json({ error: "Erro interno ao salvar configurações." }, { status: 500 });
  }
}

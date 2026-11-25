import tacoFoodsRaw from "./taco-foods.json";

export interface TacoFood {
  id: number;
  name: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  fib: number;
  na: number;
  cat: string;
}

export const TACO_FOODS = tacoFoodsRaw as Record<string, TacoFood>;

export interface MealItem {
  food_id: number;
  grams: number;
  note: string;
}

export type OptionKey = "A" | "B" | "C";

export interface MealOption {
  label: string;
  items: MealItem[];
}

export interface Meal {
  id: 1 | 2 | 3 | 4 | 5;
  title: string;
  time: string;
  options: Record<OptionKey, MealOption>;
}

export type SelectedMeals = Record<"1" | "2" | "3" | "4" | "5", OptionKey>;

export const DEFAULT_SELECTED_MEALS: SelectedMeals = {
  "1": "A",
  "2": "A",
  "3": "A",
  "4": "A",
  "5": "A",
};

export const MEALS_DATA: Meal[] = [
  {
    id: 1,
    title: "Refeição 1 • Café da Manhã",
    time: "07:30",
    options: {
      A: {
        label: "Opção A (Sua Panqueca c/ Leitíssimo + Geleia Oba + ½ Papaia)",
        items: [
          { food_id: 489, grams: 50, note: "1 ovo inteiro na massa" },
          { food_id: 906, grams: 25, note: "25g Leite Integral Leitíssimo Zero Lactose" },
          { food_id: 7, grams: 20, note: "Aveia em flocos na massa" },
          { food_id: 901, grams: 5, note: "Cacau 100% s/ açúcar + pitada canela" },
          { food_id: 182, grams: 70, note: "1 banana prata média na massa" },
          { food_id: 902, grams: 20, note: "1 colher sopa Geleia s/ açúcar Oba" },
          { food_id: 226, grams: 140, note: "½ mamão papaia médio" },
        ],
      },
      B: {
        label: "Opção B (Sua Panqueca Turbinada c/ Leitíssimo + 2 Claras + Geleia Oba)",
        items: [
          { food_id: 489, grams: 50, note: "1 ovo inteiro na massa" },
          { food_id: 486, grams: 60, note: "+2 claras na massa (mais proteína!)" },
          { food_id: 906, grams: 25, note: "25g Leite Integral Leitíssimo Zero Lactose" },
          { food_id: 7, grams: 20, note: "Aveia em flocos na massa" },
          { food_id: 901, grams: 5, note: "Cacau 100% s/ açúcar + pitada canela" },
          { food_id: 182, grams: 70, note: "1 banana prata média" },
          { food_id: 902, grams: 20, note: "Geleia s/ açúcar Oba" },
          { food_id: 226, grams: 140, note: "½ mamão papaia médio" },
        ],
      },
      C: {
        label: "Opção C (Salgada: Pão Integral + Ovos Mexidos + ½ Papaia)",
        items: [
          { food_id: 488, grams: 100, note: "2 ovos inteiros mexidos" },
          { food_id: 486, grams: 60, note: "2 claras" },
          { food_id: 52, grams: 50, note: "2 fatias de pão integral" },
          { food_id: 226, grams: 140, note: "½ mamão papaia médio" },
        ],
      },
    },
  },
  {
    id: 2,
    title: "Refeição 2 • Colação / Lanche da Manhã",
    time: "10:30",
    options: {
      A: {
        label: "Opção A (Iogurte + Aveia + Morangos + Castanha)",
        items: [
          { food_id: 449, grams: 170, note: "1 pote" },
          { food_id: 7, grams: 20, note: "1,5 colher de sopa" },
          { food_id: 239, grams: 100, note: "~8 morangos" },
          { food_id: 589, grams: 10, note: "2 castanhas-do-Pará" },
        ],
      },
      B: {
        label: "Opção B (Ovo + Requeijão Zero Lactose + Abacaxi + Castanha)",
        items: [
          { food_id: 488, grams: 50, note: "1 ovo cozido/mexido" },
          { food_id: 904, grams: 25, note: "1 colher sopa Requeijão Zero Lactose" },
          { food_id: 164, grams: 150, note: "2 fatias médias" },
          { food_id: 588, grams: 10, note: "~5 castanhas de caju" },
        ],
      },
      C: {
        label: "Opção C (Vitamina: Leite Desnatado + Abacate + Banana)",
        items: [
          { food_id: 456, grams: 30, note: "3 colheres sopa em 200ml água" },
          { food_id: 163, grams: 60, note: "2 colheres sopa de abacate" },
          { food_id: 179, grams: 80, note: "1 banana nanica média" },
          { food_id: 7, grams: 15, note: "1 colher de sopa" },
        ],
      },
    },
  },
  {
    id: 3,
    title: "Refeição 3 • Almoço + Café c/ Chocolate",
    time: "13:00",
    options: {
      A: {
        label: "Opção A (Frango + Arroz Branco + Feijão + 20g Chocolate Nestlé)",
        items: [
          { food_id: 408, grams: 150, note: "1 filé grande grelhado (peso pronto)" },
          { food_id: 3, grams: 70, note: "3 colheres de sopa de arroz branco (60g se comer 25g choc)" },
          { food_id: 561, grams: 80, note: "1 concha pequena de feijão carioca" },
          { food_id: 100, grams: 100, note: "1 xícara de brócolis" },
          { food_id: 161, grams: 80, note: "4 rodelas de tomate" },
          { food_id: 78, grams: 50, note: "Salada verde (temperar c/ limão/vinagre s/ azeite)" },
          { food_id: 495, grams: 20, note: "Pós-almoço: Café s/ açúcar + 20-22g Chocolate ao Leite" },
        ],
      },
      B: {
        label: "Opção B (Patinho Bovino + Arroz Branco + Feijão + 20g Chocolate)",
        items: [
          { food_id: 377, grams: 130, note: "Patinho grelhado/moído (peso pronto)" },
          { food_id: 3, grams: 70, note: "3 colheres de sopa de arroz branco" },
          { food_id: 567, grams: 80, note: "1 concha pequena de feijão preto" },
          { food_id: 64, grams: 100, note: "Abóbora cabotiá cozida" },
          { food_id: 78, grams: 50, note: "Folhas verdes (s/ azeite)" },
          { food_id: 495, grams: 20, note: "Pós-almoço: Café s/ açúcar + 20-22g Chocolate ao Leite" },
        ],
      },
      C: {
        label: "Opção C (Filé de Merluza Assado + Batata Inglesa + Lentilha)",
        items: [
          { food_id: 301, grams: 180, note: "Filé assado/grelhado" },
          { food_id: 91, grams: 180, note: "Batata inglesa cozida/airfryer" },
          { food_id: 577, grams: 100, note: "1 concha de lentilha" },
          { food_id: 109, grams: 100, note: "Cenoura cozida" },
          { food_id: 78, grams: 50, note: "Folhas verdes" },
          { food_id: 260, grams: 8, note: "1 colher de sobremesa rasa" },
        ],
      },
    },
  },
  {
    id: 4,
    title: "Refeição 4 • Lanche da Tarde / Pré-Treino",
    time: "16:30 (Treino 18h)",
    options: {
      A: {
        label: "Opção A (Pão Francês/Sal c/ Frango e Requeijão Zero Lactose + Banana)",
        items: [
          { food_id: 53, grams: 50, note: "1 pão francês/sal (50g; s/ miolo = 42g)" },
          { food_id: 408, grams: 90, note: "Frango desfiado" },
          { food_id: 904, grams: 25, note: "1 colher sopa Requeijão Zero Lactose (25g)" },
          { food_id: 179, grams: 90, note: "1 banana média (às 16:30 ou às 17:30)" },
        ],
      },
      B: {
        label: "Opção B (Marmita Rápida: Atum + Arroz Branco + Laranja)",
        items: [
          { food_id: 278, grams: 110, note: "Atum sólido em água/natural" },
          { food_id: 3, grams: 90, note: "3,5 colheres de sopa de arroz branco" },
          { food_id: 214, grams: 130, note: "1 laranja pêra média" },
          { food_id: 260, grams: 5, note: "1 colher de chá de azeite" },
        ],
      },
      C: {
        label: "Opção C (Panqueca Proteica de Ovos, Claras, Aveia e Banana)",
        items: [
          { food_id: 488, grams: 100, note: "2 ovos inteiros" },
          { food_id: 486, grams: 60, note: "2 claras" },
          { food_id: 7, grams: 35, note: "2,5 colheres de sopa de aveia" },
          { food_id: 179, grams: 90, note: "1 banana amassada na massa" },
        ],
      },
    },
  },
  {
    id: 5,
    title: "Refeição 5 • Jantar (Pós-Treino)",
    time: "20:30",
    options: {
      A: {
        label: "Opção A (Patinho Grelhado + Arroz Branco + Legumes)",
        items: [
          { food_id: 377, grams: 130, note: "Patinho bovino s/ gordura grelhado" },
          { food_id: 3, grams: 100, note: "4 colheres de sopa de arroz branco" },
          { food_id: 109, grams: 100, note: "Cenoura cozida no vapor" },
          { food_id: 78, grams: 50, note: "Salada de alface" },
          { food_id: 260, grams: 5, note: "1 colher de chá de azeite" },
        ],
      },
      B: {
        label: "Opção B (Peito de Frango + Abóbora Cabotiá + Brócolis)",
        items: [
          { food_id: 408, grams: 150, note: "Peito de frango grelhado" },
          { food_id: 64, grams: 160, note: "Abóbora cabotiá assada/cozida" },
          { food_id: 100, grams: 100, note: "Brócolis cozido" },
          { food_id: 161, grams: 80, note: "Tomate em rodelas" },
          { food_id: 260, grams: 8, note: "1 colher de sobremesa rasa de azeite" },
        ],
      },
      C: {
        label: "Opção C (Salmão Grelhado + Batata Inglesa + Brócolis)",
        items: [
          { food_id: 317, grams: 130, note: "Filé de salmão grelhado s/ pele" },
          { food_id: 91, grams: 150, note: "Batata inglesa cozida/airfryer" },
          { food_id: 100, grams: 100, note: "Brócolis cozido" },
          { food_id: 78, grams: 50, note: "Salada verde" },
        ],
      },
    },
  },
];

export const QUICK_PRESETS = [
  { foodId: 3, grams: 70, label: "🍚 Arroz Branco (70g)" },
  { foodId: 561, grams: 80, label: "🫘 Feijão Carioca (80g)" },
  { foodId: 408, grams: 150, label: "🍗 Frango Grelhado (150g)" },
  { foodId: 377, grams: 130, label: "🥩 Patinho Grelhado (130g)" },
  { foodId: 53, grams: 50, label: "🥖 Pão Francês (50g)" },
  { foodId: 905, grams: 40, label: "🫓 Wrap / Rap10 (40g)" },
  { foodId: 7, grams: 20, label: "🥣 Aveia em Flocos (20g)" },
  { foodId: 182, grams: 70, label: "🍌 Banana Prata (70g)" },
  { foodId: 495, grams: 20, label: "🍫 Chocolate ao Leite (20g)" },
];

export const STAPLE_PRESETS: Record<string, { id: number; name: string; icon: string }[]> = {
  Carboidratos: [
    { id: 88, name: "Batata Doce cozida", icon: "🍠" },
    { id: 91, name: "Batata Inglesa cozida", icon: "🥔" },
    { id: 129, name: "Mandioca cozida", icon: "🌿" },
    { id: 64, name: "Abóbora Cabotian", icon: "🎃" },
    { id: 52, name: "Pão de Forma Integral", icon: "🥪" },
    { id: 53, name: "Pão Francês", icon: "🥖" },
    { id: 905, name: "Wrap / Rap10", icon: "🫓" },
    { id: 7, name: "Aveia em Flocos", icon: "🥣" },
  ],
  Proteínas: [
    { id: 408, name: "Peito de Frango grelhado", icon: "🍗" },
    { id: 377, name: "Patinho bovino grelhado", icon: "🥩" },
    { id: 301, name: "Filé de Merluza assado", icon: "🐟" },
    { id: 278, name: "Atum em água", icon: "🐟" },
    { id: 489, name: "Ovos de galinha inteiros", icon: "🥚" },
    { id: 486, name: "Claras de ovo", icon: "⚪" },
  ],
  Frutas: [
    { id: 182, name: "Banana prata", icon: "🍌" },
    { id: 226, name: "Mamão Papaia", icon: "🍈" },
    { id: 239, name: "Morangos frescos", icon: "🍓" },
    { id: 222, name: "Maçã Fuji", icon: "🍎" },
    { id: 214, name: "Laranja pera", icon: "🍊" },
    { id: 164, name: "Abacaxi", icon: "🍍" },
  ],
  Laticínios: [
    { id: 449, name: "Iogurte desnatado", icon: "🥛" },
    { id: 904, name: "Requeijão zero lactose", icon: "🧀" },
    { id: 469, name: "Queijo ricota", icon: "🧀" },
    { id: 461, name: "Queijo minas frescal", icon: "🧀" },
    { id: 906, name: "Leite Leitíssimo zero", icon: "🥛" },
  ],
};

export const SWAP_CATEGORIES = [
  { key: "all", label: "Todos" },
  { key: "Carboidratos", label: "🌾 Carboidratos" },
  { key: "Proteínas", label: "🍗 Proteínas" },
  { key: "Frutas", label: "🍎 Frutas" },
  { key: "Laticínios", label: "🧀 Laticínios" },
  { key: "Gorduras", label: "🥑 Gorduras" },
  { key: "Vegetais", label: "🥦 Vegetais" },
] as const;

export const HUNGER_OPTIONS = [
  { value: 2, label: "2/10 — Muito saciado" },
  { value: 3, label: "3/10 — Fome leve normal antes das refeições" },
  { value: 5, label: "5/10 — Fome moderada à tarde/noite" },
  { value: 7, label: "7/10 — Fome alta (difícil segurar)" },
  { value: 9, label: "9/10 — Fome extrema" },
];

export const ENERGY_OPTIONS = [
  { value: 9, label: "9/10 — Treino excelente / progrediu carga" },
  { value: 8, label: "8/10 — Boa energia e disposição" },
  { value: 6, label: "6/10 — Energia mediana / cansaço no final" },
  { value: 4, label: "4/10 — Fraco / sem gás às 18h" },
  { value: 0, label: "Dia de Descanso (Sem treino hoje)" },
];

export const DIGESTION_OPTIONS = [
  { value: "Sono bom, digestão leve e intestino regular", label: "Sono bom • Digestão ótima" },
  { value: "Sono regular, leve estufamento abdominal", label: "Sono regular • Leve estufamento" },
  { value: "Sono ruim/curto, mais cansaço durante o dia", label: "Sono curto • Mais cansado" },
  { value: "Intestino preso / retenção líquida", label: "Intestino preso / Retenção" },
];

export const DEFAULT_CHECKPOINTS = [
  { recorded_date: "2026-11-08", weight_kg: 87.0, source: "checkpoint" as const, is_projected: false, notes: "Início do protocolo (Sem 0)" },
  { recorded_date: "2026-11-15", weight_kg: 86.2, source: "projected" as const, is_projected: true, notes: "Projeção inicial (Sem 1)" },
  { recorded_date: "2026-11-22", weight_kg: 85.7, source: "projected" as const, is_projected: true, notes: "Projeção inicial (Sem 2)" },
  { recorded_date: "2026-11-29", weight_kg: 85.1, source: "projected" as const, is_projected: true, notes: "Projeção inicial (Sem 3)" },
  { recorded_date: "2026-12-06", weight_kg: 84.7, source: "projected" as const, is_projected: true, notes: "Projeção inicial (Sem 4)" },
  { recorded_date: "2026-12-13", weight_kg: 84.2, source: "projected" as const, is_projected: true, notes: "Projeção inicial (Sem 5)" },
  { recorded_date: "2026-12-20", weight_kg: 83.8, source: "projected" as const, is_projected: true, notes: "Projeção inicial (Sem 6)" },
  { recorded_date: "2026-12-31", weight_kg: 83.3, source: "projected" as const, is_projected: true, notes: "Projeção inicial (Sem 7 - Fim do Ano)" },
];

export interface Macros {
  kcal: number;
  p: number;
  c: number;
  f: number;
  fib: number;
  na: number;
}

export interface UserSettingsDTO {
  sim_deficit: number;
  tmb_kcal: number;
  get_kcal: number;
  calorie_goal: number;
  protein_goal: number;
  carb_goal: number;
  fat_goal: number;
  fiber_goal: number;
  sodium_limit: number;
  water_goal_ml: number;
  start_weight_kg: number;
  target_weight_min_kg: number;
  target_weight_max_kg: number;
  protocol_start_date: string;
  protocol_end_date: string;
  height_cm: number;
  age_years: number;
  sex: 0 | 1;
  scale_user_id: number | null;
}

export interface WeightLogDTO {
  id: number;
  recorded_date: string;
  weight_kg: number;
  source: "manual" | "checkin" | "checkpoint" | "projected" | "scale";
  is_projected: boolean;
  notes: string | null;
}

export interface DailyLogDTO {
  id?: number;
  log_date: string;
  selected_options: SelectedMeals;
  water_ml: number;
  weight_kg: number | null;
  hunger_score: number | null;
  hunger_label: string | null;
  training_energy_score: number | null;
  training_energy_label: string | null;
  sleep_digestion: string | null;
  notes: string | null;
  total_kcal: number | null;
  total_protein_g: number | null;
  total_carbs_g: number | null;
  total_fat_g: number | null;
  total_fiber_g: number | null;
  balance_score: number | null;
  checkin_submitted: boolean;
  updated_at?: string;
}

export interface EWMAPoint {
  id: number;
  recorded_date: string;
  label: string;
  fullDateBR: string;
  day: number;
  raw: number;
  trend: number;
  theoretical: number;
  source: WeightLogDTO["source"];
  is_projected: boolean;
  notes: string | null;
}

export function calcItemMacros(foodId: number, grams: number): Macros {
  const f = TACO_FOODS[String(foodId)];
  if (!f) return { kcal: 0, p: 0, c: 0, f: 0, fib: 0, na: 0 };
  const factor = grams / 100.0;
  return {
    kcal: f.kcal * factor,
    p: f.p * factor,
    c: f.c * factor,
    f: f.f * factor,
    fib: f.fib * factor,
    na: f.na * factor,
  };
}

export function calcMealMacros(meal: Meal, optKey: OptionKey): Macros {
  const opt = meal.options[optKey] ?? meal.options.A;
  const total: Macros = { kcal: 0, p: 0, c: 0, f: 0, fib: 0, na: 0 };
  for (const it of opt.items) {
    const m = calcItemMacros(it.food_id, it.grams);
    total.kcal += m.kcal;
    total.p += m.p;
    total.c += m.c;
    total.f += m.f;
    total.fib += m.fib;
    total.na += m.na;
  }
  return total;
}

export function computeDailyTotals(selected: SelectedMeals): Macros {
  const totals: Macros = { kcal: 0, p: 0, c: 0, f: 0, fib: 0, na: 0 };
  for (const meal of MEALS_DATA) {
    const key = selected[String(meal.id) as keyof SelectedMeals] ?? "A";
    const m = calcMealMacros(meal, key);
    totals.kcal += m.kcal;
    totals.p += m.p;
    totals.c += m.c;
    totals.f += m.f;
    totals.fib += m.fib;
    totals.na += m.na;
  }
  return totals;
}

export function computeBalanceScore(
  totals: Macros,
  goals: { kcal: number; p: number; c: number; f: number }
): number {
  const keys: ("kcal" | "p" | "c" | "f")[] = ["kcal", "p", "c", "f"];
  let sum = 0;
  for (const k of keys) {
    const ratio = totals[k] / goals[k];
    if (ratio >= 0.85 && ratio <= 1.15) sum += 100;
    else if (ratio >= 0.7 && ratio <= 1.3) sum += 85;
    else sum += 65;
  }
  return Math.round(sum / keys.length);
}

export function daysBetweenISO(startISO: string, endISO: string): number {
  const s = new Date(`${startISO}T00:00:00Z`).getTime();
  const e = new Date(`${endISO}T00:00:00Z`).getTime();
  return Math.round((e - s) / (24 * 60 * 60 * 1000));
}

export function formatShortDateBR(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

export function formatFullDateBR(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function getTodayBrazilISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function normStr(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function computeEWMATrend(
  weights: WeightLogDTO[],
  simDeficit: number,
  startWeightKg = 87.0,
  protocolStartDate = "2026-11-08"
): EWMAPoint[] {
  const sorted = [...weights].sort((a, b) => a.recorded_date.localeCompare(b.recorded_date));
  const alphaDay = 0.15;
  let prevTrend: number | null = null;
  let prevDay = 0;

  return sorted.map((pt, idx) => {
    const day = daysBetweenISO(protocolStartDate, pt.recorded_date);
    const gapDays = idx === 0 ? 0 : Math.max(1, day - prevDay);
    prevDay = day;

    // For projected points, adjust dynamically with the simulated deficit slider
    const rawVal =
      pt.is_projected && day > 0
        ? Math.round((startWeightKg - (simDeficit * day) / 7700.0) * 10) / 10
        : Number(pt.weight_kg);

    const stepAlpha = idx === 0 ? 1 : 1 - Math.pow(1 - alphaDay, gapDays);
    const trend: number = prevTrend === null ? rawVal : prevTrend + stepAlpha * (rawVal - prevTrend);
    prevTrend = trend;

    const theoLoss = (simDeficit * Math.max(0, day)) / 7700.0;
    const theoretical = Math.round((startWeightKg - theoLoss) * 100) / 100;

    return {
      id: pt.id,
      recorded_date: pt.recorded_date,
      label: formatShortDateBR(pt.recorded_date),
      fullDateBR: formatFullDateBR(pt.recorded_date),
      day,
      raw: rawVal,
      trend: Math.round(trend * 100) / 100,
      theoretical,
      source: pt.source,
      is_projected: pt.is_projected,
      notes: pt.notes,
    };
  });
}

export function buildCheckinReportText(params: {
  logDate: string;
  weightKg: number | null;
  waterMl: number;
  selectedOptions: SelectedMeals;
  hungerLabel: string;
  energyLabel: string;
  sleepDigestion: string;
  notes: string;
}): string {
  const totals = computeDailyTotals(params.selectedOptions);
  const chosen = MEALS_DATA.map(
    (m) => `R${m.id}:${params.selectedOptions[String(m.id) as keyof SelectedMeals] ?? "A"}`
  );
  const notesText = params.notes.trim() || "Segui o cardápio selecionado nas 5 refeições.";
  const weightText = params.weightKg !== null ? `${params.weightKg.toFixed(1)} kg` : "Não informado";

  return (
    `[CHECK-IN NUTRICIONAL — ${params.logDate}]\n` +
    `• Peso em jejum: ${weightText} | Água: ${params.waterMl} ml\n` +
    `• Cardápio base: ${chosen.join(", ")} (${totals.kcal.toFixed(0)} kcal | P:${totals.p.toFixed(0)}g C:${totals.c.toFixed(0)}g G:${totals.f.toFixed(0)}g Fib:${totals.fib.toFixed(0)}g)\n` +
    `• Alimentação / Trocas: ${notesText}\n` +
    `• Sensações: Fome [${params.hungerLabel}] | Treino 18h [${params.energyLabel}] | ${params.sleepDigestion}`
  );
}

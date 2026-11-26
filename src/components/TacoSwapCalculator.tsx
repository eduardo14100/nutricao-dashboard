"use client";

import { useMemo, useState } from "react";
import {
  calcItemMacros,
  normStr,
  QUICK_PRESETS,
  STAPLE_PRESETS,
  SWAP_CATEGORIES,
  TACO_FOODS,
  type TacoFood,
} from "@/data/nutrition";

const ALL_FOODS: TacoFood[] = Object.values(TACO_FOODS);

// Busca aproximada (palavras em qualquer ordem, sem acento, plural e erros de digitação)
const SEARCH_STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "as",
  "os",
  "em",
  "na",
  "no",
  "ao",
  "com",
]);

function searchTokens(str: string): string[] {
  return normStr(str)
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !SEARCH_STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t)); // "ovos" ≈ "ovo"
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function tokenScore(q: string, words: string[], fullName: string): number {
  let best = 0;
  const maxTypos = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  for (const w of words) {
    if (w === q) return 4;
    if (w.startsWith(q)) best = Math.max(best, 3);
    else if (q.length >= 3 && w.includes(q)) best = Math.max(best, 2);
    else if (maxTypos > 0) {
      const d = Math.min(
        editDistance(q, w, maxTypos),
        editDistance(q, w.slice(0, q.length), maxTypos)
      );
      if (d <= maxTypos) best = Math.max(best, 1.5 - d * 0.25);
    }
  }
  if (!best && q.length >= 3 && fullName.includes(q)) best = 1;
  return best;
}

function scoreFood(f: TacoFood, tokens: string[], rawQuery: string): { score: number; matched: number } {
  const nName = normStr(f.name);
  if (String(f.id) === rawQuery.trim()) return { score: 1000, matched: tokens.length };
  const words = searchTokens(f.name);
  let score = 0;
  let matched = 0;
  tokens.forEach((q, i) => {
    const s = tokenScore(q, words, nName);
    if (s > 0) {
      matched++;
      score += s;
      if (i === 0 && words[0] && words[0].startsWith(q)) score += 1.5;
    }
  });
  if (nName.startsWith(normStr(rawQuery).trim())) score += 3;
  return { score, matched };
}

function fuzzyFilterFoods(
  rawQuery: string,
  category: string,
  isFrom: boolean
): { foods: TacoFood[]; partial: boolean; outsideCategory: boolean; hasQuery: boolean } {
  const tokens = searchTokens(rawQuery);
  const inCategory = (f: TacoFood) => isFrom || category === "all" || f.cat === category;

  if (!tokens.length) {
    const foods = ALL_FOODS.filter(inCategory).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return { foods, partial: false, outsideCategory: false, hasQuery: false };
  }

  const rank = (pool: TacoFood[]) =>
    pool
      .map((f) => ({ f, ...scoreFood(f, tokens, rawQuery) }))
      .filter((r) => r.matched > 0);

  let ranked = rank(ALL_FOODS.filter(inCategory));
  let outsideCategory = false;
  if (!ranked.length && !isFrom && category !== "all") {
    ranked = rank(ALL_FOODS);
    outsideCategory = ranked.length > 0;
  }

  let partial = false;
  let picked = ranked.filter((r) => r.matched === tokens.length);
  if (!picked.length && ranked.length > 0) {
    const bestMatched = Math.max(...ranked.map((r) => r.matched));
    picked = ranked.filter((r) => r.matched === bestMatched);
    partial = true;
  }

  picked.sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name, "pt-BR"));
  return {
    foods: picked.map((r) => r.f),
    partial,
    outsideCategory,
    hasQuery: true,
  };
}

function formatDiff(val: number) {
  if (Math.abs(val) < 0.1) {
    return <span className="text-slate-400 font-normal">igual</span>;
  }
  const sign = val > 0 ? "+" : "";
  const color = val > 0 ? "text-emerald-400" : "text-amber-400";
  return (
    <span className={`${color} font-bold`}>
      {sign}
      {val.toFixed(1)}g
    </span>
  );
}

export default function TacoSwapCalculator() {
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [fromId, setFromId] = useState<number>(3);
  const [toId, setToId] = useState<number>(88);
  const [grams, setGrams] = useState<number>(70);
  const [category, setCategory] = useState<string>("Carboidratos");

  const fromResult = useMemo(() => fuzzyFilterFoods(fromSearch, "all", true), [fromSearch]);
  const toResult = useMemo(() => fuzzyFilterFoods(toSearch, category, false), [toSearch, category]);

  const fromOptions = fromResult.foods;
  const toOptions = toResult.foods;

  // Ao digitar, prioriza o melhor resultado (top 1); sem busca, preserva a seleção atual
  const effectiveFromId = fromOptions.some((f) => f.id === fromId)
    ? fromId
    : (fromOptions[0]?.id ?? 3);

  const effectiveToId = toOptions.some((f) => f.id === toId)
    ? toId
    : (toOptions[0]?.id ?? 88);

  const fFrom = TACO_FOODS[String(effectiveFromId)];
  const fTo = TACO_FOODS[String(effectiveToId)];

  const handleFromSearchChange = (val: string) => {
    setFromSearch(val);
    const res = fuzzyFilterFoods(val, "all", true);
    if (res.hasQuery && res.foods.length > 0) {
      setFromId(res.foods[0].id);
    }
  };

  const handleToSearchChange = (val: string) => {
    setToSearch(val);
    const res = fuzzyFilterFoods(val, category, false);
    if (res.hasQuery && res.foods.length > 0) {
      setToId(res.foods[0].id);
    }
  };

  const handlePreset = (foodId: number, presetGrams: number) => {
    setFromSearch("");
    setFromId(foodId);
    setGrams(presetGrams);
    const f = TACO_FOODS[String(foodId)];
    if (f?.cat && f.cat !== "Outros") {
      setCategory(f.cat);
    }
  };

  const handleFromSelect = (nextId: number) => {
    setFromId(nextId);
    const f = TACO_FOODS[String(nextId)];
    if (f?.cat && f.cat !== "Outros") {
      setCategory(f.cat);
    }
  };

  const handleSmartSubstitute = (targetId: number) => {
    setToSearch("");
    setToId(targetId);
  };

  const validCalc = Boolean(fFrom && fTo && grams > 0 && fTo.kcal > 0);
  const origKcal = validCalc ? (fFrom.kcal * grams) / 100.0 : 0;
  const eqGrams = validCalc ? (origKcal / fTo.kcal) * 100.0 : 0;
  const origMacros = validCalc ? calcItemMacros(effectiveFromId, grams) : null;
  const eqMacros = validCalc ? calcItemMacros(effectiveToId, eqGrams) : null;

  const smartStaples = useMemo(() => {
    if (!fFrom) return [];
    const list = STAPLE_PRESETS[fFrom.cat] ?? STAPLE_PRESETS.Carboidratos;
    return list.filter((st) => st.id !== effectiveFromId && Boolean(TACO_FOODS[String(st.id)]));
  }, [fFrom, effectiveFromId]);

  const toBadgeText =
    `${toOptions.length} opções disponíveis` +
    (toResult.outsideCategory ? " (fora da categoria)" : "") +
    (toResult.partial ? " (parecidos)" : "");

  return (
    <section className="surface-card rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="heading-section text-base sm:text-lg font-semibold text-white">
              Calculadora de Substituições — Tabela TACO
            </h2>
            <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-400 font-medium border border-emerald-500/25">
              {ALL_FOODS.length} alimentos • Busca aproximada
            </span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Pesquise em qualquer ordem, sem acento ou com pequenos erros para encontrar a porção equivalente nas mesmas calorias.
          </p>
        </div>
        <div className="text-[11px] font-mono text-[var(--muted-foreground)] hidden sm:block">
          TACO 4ª Ed. • UNICAMP
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
          Alimentos frequentes
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.foodId}
              type="button"
              onClick={() => handlePreset(p.foodId, p.grams)}
              className="btn-press px-2.5 py-1.5 text-xs rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300 cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
        <div className="md:col-span-5 space-y-1.5">
          <label className="block text-xs font-medium text-slate-200">
            1. Alimento original na dieta
          </label>
          <input
            type="text"
            value={fromSearch}
            onChange={(e) => handleFromSearchChange(e.target.value)}
            placeholder="Digite para pesquisar (ex: arroz cozido, frango, ovos...)"
            className="input-field w-full h-9 rounded-lg px-3 text-xs"
          />
          <select
            value={effectiveFromId}
            onChange={(e) => handleFromSelect(Number(e.target.value))}
            className="input-field w-full h-9 rounded-lg px-2.5 text-xs"
          >
            {fromOptions.length === 0 ? (
              <option value="">Nenhum alimento parecido encontrado</option>
            ) : (
              fromOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.kcal.toFixed(0)} kcal ({f.cat || "Geral"}) [P:{f.p}g C:{f.c}g G:{f.f}g]
                </option>
              ))
            )}
          </select>
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <label className="block text-xs font-medium text-slate-200">2. Gramas (g)</label>
          <input
            type="number"
            step={1}
            min={1}
            value={grams}
            onChange={(e) => setGrams(Math.max(0, Number(e.target.value) || 0))}
            className="input-field w-full h-9 rounded-lg px-3 text-xs font-mono font-semibold tabular-nums text-emerald-400 text-center"
          />
          <div className="text-[10px] text-center text-[var(--muted-foreground)]">
            Peso pronto / dieta
          </div>
        </div>

        <div className="md:col-span-5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-slate-200">
              3. Substituir por
            </label>
            <span className="text-[10px] font-mono tabular-nums text-emerald-400 font-medium">{toBadgeText}</span>
          </div>
          <input
            type="text"
            value={toSearch}
            onChange={(e) => handleToSearchChange(e.target.value)}
            placeholder="Digite para pesquisar (ex: batata doce, atum, wrap...)"
            className="input-field w-full h-9 rounded-lg px-3 text-xs"
          />
          <select
            value={effectiveToId}
            onChange={(e) => setToId(Number(e.target.value))}
            className="input-field w-full h-9 rounded-lg px-2.5 text-xs"
          >
            {toOptions.length === 0 ? (
              <option value="">Nenhum alimento parecido encontrado</option>
            ) : (
              toOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.kcal.toFixed(0)} kcal ({f.cat || "Geral"}) [P:{f.p}g C:{f.c}g G:{f.f}g]
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs pt-0.5">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] mr-1">
          Categoria
        </span>
        {SWAP_CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`btn-press px-2.5 py-1 rounded-full text-xs border cursor-pointer ${
                active
                  ? "font-semibold border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "font-medium border-white/[0.08] bg-white/[0.025] text-[var(--muted-foreground)] hover:text-white hover:border-white/[0.14]"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="surface-inset rounded-xl p-4 sm:p-5 border border-emerald-500/25 space-y-4">
        {validCalc && origMacros && eqMacros ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/[0.06] pb-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400">
                  Equivalência Calórica Exata
                </div>
                <div className="text-base sm:text-lg font-semibold text-white mt-1 leading-snug">
                  <span className="font-mono tabular-nums">{grams}g</span> de {fFrom.name}{" "}
                  <span className="text-[var(--muted-foreground)] font-normal">equivale a</span>{" "}
                  <span className="text-emerald-400">
                    <span className="font-mono tabular-nums">{Math.round(eqGrams)} g</span> de {fTo.name}
                  </span>
                </div>
                <div className="text-xs text-[var(--muted-foreground)] mt-1 tabular-nums">
                  Calorias mantidas na dieta:{" "}
                  <b className="font-mono text-white">{origKcal.toFixed(0)} kcal</b> (zero impacto no déficit)
                </div>
              </div>
              <div className="rounded-xl bg-[#090c11] border border-white/[0.08] px-4 py-2.5 text-center shrink-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
                  Porção ideal
                </div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-emerald-400 mt-0.5">
                  {Math.round(eqGrams)}
                  <span className="text-xs font-sans font-normal text-slate-300 ml-1">g</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] border-b border-white/[0.07]">
                    <th className="py-2 font-medium">Nutriente</th>
                    <th className="py-2 font-medium text-slate-300">
                      Original ({grams}g {fFrom.name.split(",")[0]})
                    </th>
                    <th className="py-2 font-medium text-emerald-400">
                      Substituto ({Math.round(eqGrams)}g {fTo.name.split(",")[0]})
                    </th>
                    <th className="py-2 font-medium">Variação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] font-mono tabular-nums">
                  <tr>
                    <td className="py-2 font-sans font-medium text-slate-200">Calorias</td>
                    <td className="py-2 text-slate-300">{origKcal.toFixed(0)} kcal</td>
                    <td className="py-2 text-emerald-400 font-semibold">{origKcal.toFixed(0)} kcal</td>
                    <td className="py-2 font-sans text-[var(--muted-foreground)]">0 kcal (exato)</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-sans font-medium text-slate-200">Proteínas</td>
                    <td className="py-2 text-slate-300">{origMacros.p.toFixed(1)} g</td>
                    <td className="py-2 text-emerald-400 font-semibold">{eqMacros.p.toFixed(1)} g</td>
                    <td className="py-2">{formatDiff(eqMacros.p - origMacros.p)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-sans font-medium text-slate-200">Carboidratos</td>
                    <td className="py-2 text-slate-300">{origMacros.c.toFixed(1)} g</td>
                    <td className="py-2 text-emerald-400 font-semibold">{eqMacros.c.toFixed(1)} g</td>
                    <td className="py-2">{formatDiff(eqMacros.c - origMacros.c)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-sans font-medium text-slate-200">Gorduras</td>
                    <td className="py-2 text-slate-300">{origMacros.f.toFixed(1)} g</td>
                    <td className="py-2 text-emerald-400 font-semibold">{eqMacros.f.toFixed(1)} g</td>
                    <td className="py-2">{formatDiff(eqMacros.f - origMacros.f)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-sans font-medium text-slate-200">Fibras</td>
                    <td className="py-2 text-slate-300">{origMacros.fib.toFixed(1)} g</td>
                    <td className="py-2 text-emerald-400 font-semibold">{eqMacros.fib.toFixed(1)} g</td>
                    <td className="py-2">{formatDiff(eqMacros.fib - origMacros.fib)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-xs text-[var(--muted-foreground)]">
            Selecione os alimentos e informe uma quantidade válida em gramas.
          </div>
        )}
      </div>

      {validCalc && smartStaples.length > 0 ? (
        <div className="space-y-2.5 border-t border-white/[0.06] pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200 tabular-nums">
              Sugestões rápidas para {grams}g de {fFrom.name.split(",")[0]} ({origKcal.toFixed(0)} kcal)
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)]">Clique para aplicar</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {smartStaples.map((st) => {
              const itemF = TACO_FOODS[String(st.id)];
              const itemEqGrams = Math.round((origKcal / itemF.kcal) * 100.0);
              const isSelected = st.id === effectiveToId;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => handleSmartSubstitute(st.id)}
                  className={`btn-press px-3 py-2 rounded-lg text-xs font-medium border text-left cursor-pointer ${
                    isSelected
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200 font-semibold"
                      : "border-white/[0.08] bg-white/[0.025] text-slate-200 hover:border-emerald-500/40 hover:text-white"
                  }`}
                >
                  <span>
                    {st.icon} {st.name}:
                  </span>{" "}
                  <b className="font-mono tabular-nums text-emerald-400 font-semibold">{itemEqGrams} g</b>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

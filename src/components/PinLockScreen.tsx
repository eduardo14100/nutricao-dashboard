"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function PinLockScreen() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitPin = useCallback(
    async (candidatePin: string) => {
      const cleaned = candidatePin.trim();
      if (cleaned.length < 4 || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: cleaned, remember }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "PIN incorreto. Tente novamente.");
          setSubmitting(false);
          return;
        }
        router.refresh();
      } catch {
        setError("Erro de conexão ao verificar o PIN.");
        setSubmitting(false);
      }
    },
    [remember, router, submitting]
  );

  const pressDigit = (digit: string) => {
    if (submitting) return;
    setError(null);
    setPin((prev) => (prev.length < 6 ? prev + digit : prev));
  };

  const clearPin = () => {
    setPin("");
    setError(null);
    inputRef.current?.focus();
  };

  const backspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  return (
    <main className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-4 select-none">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-2xl text-emerald-400 shadow-inner">
          🔒
        </div>

        <div>
          <h1 className="text-xl font-bold text-white">Acesso Protegido</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Painel Nutricional &amp; Histórico EWMA • Digite seu PIN para desbloquear
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPin(pin);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <input
              ref={inputRef}
              id="pin-input"
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
                setPin(digitsOnly);
                setError(null);
              }}
              placeholder="• • • •"
              autoComplete="off"
              inputMode="numeric"
              aria-label="PIN de acesso"
              className={`w-full text-center tracking-[0.5em] text-2xl font-bold bg-[var(--background)] border rounded-xl py-2.5 text-emerald-400 focus:outline-none focus:ring-1 transition placeholder:tracking-normal placeholder:text-slate-600 ${
                error
                  ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500"
                  : "border-[var(--border)] focus:border-emerald-500 focus:ring-emerald-500"
              }`}
            />
            {error ? (
              <div role="alert" className="text-xs text-rose-400 font-medium">
                {error}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm font-semibold">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pressDigit(d)}
                className="py-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-white hover:bg-slate-800 active:scale-95 transition cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={clearPin}
              className="py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 active:scale-95 transition text-xs cursor-pointer"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => pressDigit("0")}
              className="py-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-white hover:bg-slate-800 active:scale-95 transition cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              aria-label="Apagar último dígito"
              className="py-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-slate-300 hover:bg-slate-800 active:scale-95 transition cursor-pointer"
            >
              ⌫
            </button>
          </div>

          <div className="space-y-3 pt-1">
            <label className="flex items-center justify-center gap-2 text-xs text-[var(--muted-foreground)] cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-slate-700 accent-emerald-500"
              />
              <span>Lembrar neste aparelho (30 dias)</span>
            </label>

            <button
              type="submit"
              disabled={submitting || pin.length < 4}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 active:scale-95 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? "Verificando..." : "Desbloquear Painel"}
            </button>
          </div>
        </form>

        <div className="text-[11px] text-slate-500 pt-1">
          Autenticação validada no servidor • Dados protegidos via Supabase RLS
        </div>
      </div>
    </main>
  );
}

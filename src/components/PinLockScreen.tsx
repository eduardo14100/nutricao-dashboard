"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function PinLockScreen() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shakeCount, setShakeCount] = useState(0);
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
          setShakeCount((c) => c + 1);
          setPin("");
          setSubmitting(false);
          inputRef.current?.focus();
          return;
        }
        router.refresh();
      } catch {
        setError("Erro de conexão ao verificar o PIN.");
        setShakeCount((c) => c + 1);
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
    <main className="fixed inset-0 z-50 bg-[var(--background)] flex flex-col items-center justify-center p-4 select-none overflow-y-auto">
      {/* Quiet radial atmosphere behind the vault */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 42% at 50% 24%, rgba(16, 185, 129, 0.11), transparent 72%)",
        }}
      />

      <div className="relative surface-modal rounded-2xl w-full max-w-[360px] p-6 sm:p-7 text-center space-y-6 section-enter">
        {/* Minimal bespoke emblem */}
        <div className="space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <svg
              className="w-5 h-5 text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="11" width="16" height="10" rx="2.5" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
            </svg>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-emerald-400/90">
              Painel Nutricional
            </p>
            <h1 className="heading-display text-xl font-semibold text-white">
              Acesso Protegido
            </h1>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Digite seu PIN de 4 a 6 dígitos para desbloquear.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPin(pin);
          }}
          className="space-y-5"
        >
          {/* Tactile PIN dots synced with keyboard input */}
          <div className="space-y-2.5">
            <div
              key={shakeCount}
              onClick={() => inputRef.current?.focus()}
              className={`relative surface-inset rounded-xl px-4 py-3.5 flex items-center justify-center gap-3 cursor-text transition-colors ${
                error
                  ? "border-rose-500/60 pin-shake"
                  : "focus-within:border-emerald-500/60"
              }`}
            >
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
                autoComplete="off"
                inputMode="numeric"
                aria-label="PIN de acesso"
                className="sr-only"
              />
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const filled = idx < pin.length;
                const optional = idx >= 4;
                return (
                  <span
                    key={idx}
                    className={`w-3 h-3 rounded-full transition-colors duration-150 ${
                      filled
                        ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)] pin-dot-filled"
                        : optional
                          ? "bg-white/[0.06] border border-dashed border-white/15"
                          : "bg-white/[0.08] border border-white/15"
                    }`}
                  />
                );
              })}
            </div>

            <div className="min-h-[16px]">
              {error ? (
                <div role="alert" className="text-xs text-rose-400 font-medium content-swap">
                  {error}
                </div>
              ) : (
                <div className="text-[11px] text-[var(--muted-foreground)] font-mono tabular-nums">
                  {pin.length > 0 ? `${pin.length} / 6 dígitos` : "Use o teclado ou toque abaixo"}
                </div>
              )}
            </div>
          </div>

          {/* Precision numeric keypad */}
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pressDigit(d)}
                className="btn-press h-12 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white font-mono text-base font-medium tabular-nums hover:bg-white/[0.07] hover:border-white/[0.14] cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={clearPin}
              className="btn-press h-12 rounded-xl bg-rose-500/[0.07] border border-rose-500/20 text-rose-300/90 hover:bg-rose-500/[0.14] text-xs font-medium cursor-pointer"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => pressDigit("0")}
              className="btn-press h-12 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white font-mono text-base font-medium tabular-nums hover:bg-white/[0.07] hover:border-white/[0.14] cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              aria-label="Apagar último dígito"
              className="btn-press h-12 rounded-xl bg-white/[0.03] border border-white/[0.08] text-slate-300 hover:bg-white/[0.07] hover:border-white/[0.14] flex items-center justify-center cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            </button>
          </div>

          <div className="space-y-3.5 pt-1">
            <label className="inline-flex items-center justify-center gap-2 text-xs text-[var(--muted-foreground)] cursor-pointer hover:text-slate-300 transition-colors">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-emerald-500"
              />
              <span>Lembrar neste aparelho por 30 dias</span>
            </label>

            <button
              type="submit"
              disabled={submitting || pin.length < 4}
              className="btn-press w-full h-11 rounded-xl bg-emerald-500 text-[#032014] text-sm font-semibold hover:bg-emerald-400 shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_8px_24px_-8px_rgba(16,185,129,0.55)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? "Verificando..." : "Desbloquear Painel"}
            </button>
          </div>
        </form>

        <div className="pt-2 border-t border-white/[0.06] text-[11px] text-[var(--muted-foreground)]">
          Sessão criptografada no servidor • Supabase RLS
        </div>
      </div>
    </main>
  );
}

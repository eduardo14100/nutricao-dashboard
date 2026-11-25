"use client";

import { useState } from "react";

interface ChangePinModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ChangePinModal({ open, onClose }: ChangePinModalProps) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [status, setStatus] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!/^\d{4,6}$/.test(newPin)) {
      setStatus({ type: "error", text: "O novo PIN deve ter de 4 a 6 dígitos numéricos." });
      return;
    }
    if (newPin !== confirmPin) {
      setStatus({ type: "error", text: "A confirmação do novo PIN não confere." });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus({ type: "error", text: data.error ?? "Erro ao alterar PIN." });
      } else {
        setStatus({ type: "success", text: "✅ Novo PIN salvo no banco! Já vale em todos os aparelhos." });
        setCurrentPin("");
        setNewPin("");
        setConfirmPin("");
        setTimeout(() => {
          setStatus(null);
          onClose();
        }, 1400);
      }
    } catch {
      setStatus({ type: "error", text: "Erro de conexão ao salvar o novo PIN." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <h2 className="text-base font-bold text-white">⚙️ Alterar PIN de Acesso</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Salvo com hash seguro no Supabase (sincronizado em todos os dispositivos)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">PIN Atual</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white tracking-widest focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Novo PIN (4 a 6 dígitos)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white tracking-widest focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Confirmar Novo PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white tracking-widest focus:outline-none focus:border-emerald-500"
            />
          </div>

          {status ? (
            <div
              className={`text-xs font-medium px-3 py-2 rounded-lg border ${
                status.type === "error"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              }`}
            >
              {status.text}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--background)] text-slate-300 hover:opacity-80 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Salvando..." : "Salvar Novo PIN"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

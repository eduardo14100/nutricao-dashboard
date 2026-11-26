import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Limite de tentativas de PIN, persistido no Supabase (funções auth_gate_* da
 * migração supabase/migrations/20261125_auth_rate_limits.sql).
 *
 * Se a migração ainda não foi aplicada, as funções não existem: nesse caso o
 * gate "falha aberto" (registra aviso e deixa o login seguir), para que um
 * deploy antes da migração nunca tranque o dono para fora do painel.
 */

export interface GateStatus {
  lockedUntil: Date | null;
  available: boolean; // false = migração ausente / erro no Supabase
}

function anonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing required Supabase server environment variables.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Identifica o cliente pelo IP, guardando só um hash com segredo (nunca o IP puro). */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return crypto
    .createHash("sha256")
    .update(`${ip}|${process.env.SESSION_SECRET ?? ""}`)
    .digest("hex");
}

function toStatus(data: unknown, error: { message: string } | null, op: string): GateStatus {
  if (error) {
    console.warn(`[rate-limit] ${op} indisponível (migração aplicada?):`, error.message);
    return { lockedUntil: null, available: false };
  }
  const until = typeof data === "string" ? new Date(data) : null;
  return { lockedUntil: until && until.getTime() > Date.now() ? until : null, available: true };
}

export async function checkGate(key: string): Promise<GateStatus> {
  const { data, error } = await anonClient().rpc("auth_gate_check", { p_key: key });
  return toStatus(data, error, "auth_gate_check");
}

export async function registerFailure(key: string): Promise<GateStatus> {
  const { data, error } = await anonClient().rpc("auth_gate_fail", { p_key: key });
  return toStatus(data, error, "auth_gate_fail");
}

export async function resetGate(authed: SupabaseClient, key: string): Promise<void> {
  const { error } = await authed.rpc("auth_gate_reset", { p_key: key });
  if (error) console.warn("[rate-limit] auth_gate_reset indisponível:", error.message);
}

export function lockedMessage(until: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
  const label = minutes >= 60 ? `${Math.ceil(minutes / 60)} h` : `${minutes} min`;
  return `Muitas tentativas incorretas. Por segurança, tente novamente em ${label}.`;
}

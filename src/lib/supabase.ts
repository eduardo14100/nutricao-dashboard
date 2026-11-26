import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME, type SessionPayload } from "./auth";

function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const ownerEmail = process.env.SUPABASE_OWNER_EMAIL;
  const ownerPassword = process.env.SUPABASE_OWNER_PASSWORD;
  const ownerUserId = process.env.SUPABASE_OWNER_USER_ID;

  if (!url || !key || !ownerEmail || !ownerPassword || !ownerUserId) {
    throw new Error("Missing required Supabase server environment variables.");
  }

  return { url, key, ownerEmail, ownerPassword, ownerUserId };
}

export function createScopedClient(accessToken: string): SupabaseClient {
  const { url, key } = getSupabaseEnv();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function signInOwnerSession(remember: boolean): Promise<{
  supabase: SupabaseClient;
  session: SessionPayload;
  userId: string;
}> {
  const { url, key, ownerEmail, ownerPassword, ownerUserId } = getSupabaseEnv();
  const baseClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await baseClient.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });

  if (error || !data.session) {
    throw new Error(`Owner auth failed: ${error?.message ?? "no session returned"}`);
  }

  const session: SessionPayload = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    remember,
  };

  return {
    supabase: createScopedClient(session.accessToken),
    session,
    userId: data.user?.id ?? ownerUserId,
  };
}

// Sessão do proprietário reaproveitada (por instância serverless) apenas para LER o
// pin_hash durante o login. Assim, PINs errados não disparam um novo
// signInWithPassword a cada tentativa (o que poderia estourar o limite do Supabase
// Auth e bloquear o próprio dono). Só o access token é usado; ao expirar, renova.
let cachedOwnerReader: { client: SupabaseClient; userId: string; expiresAt: number } | null = null;

export async function getOwnerPinReader(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedOwnerReader && cachedOwnerReader.expiresAt - nowSec > 300) {
    return { supabase: cachedOwnerReader.client, userId: cachedOwnerReader.userId };
  }
  const fresh = await signInOwnerSession(false);
  cachedOwnerReader = { client: fresh.supabase, userId: fresh.userId, expiresAt: fresh.session.expiresAt };
  return { supabase: fresh.supabase, userId: fresh.userId };
}

export function invalidateOwnerPinReader(): void {
  cachedOwnerReader = null;
}

export async function getAuthedContext(): Promise<{
  supabase: SupabaseClient;
  userId: string;
  refreshedSession: SessionPayload | null;
} | null> {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawCookie) return null;

  const session = decryptSession(rawCookie);
  if (!session) return null;

  const { url, key, ownerUserId } = getSupabaseEnv();
  const nowSec = Math.floor(Date.now() / 1000);

  // If access token is still fresh (> 5 minutes left), reuse directly with zero auth roundtrips
  if (session.expiresAt - nowSec > 300) {
    return {
      supabase: createScopedClient(session.accessToken),
      userId: ownerUserId,
      refreshedSession: null,
    };
  }

  // Otherwise try refreshing the Supabase token; if refresh token expired, re-issue via owner credentials
  const refreshClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: refreshed, error: refreshErr } = await refreshClient.auth.refreshSession({
    refresh_token: session.refreshToken,
  });

  if (!refreshErr && refreshed.session) {
    const nextSession: SessionPayload = {
      accessToken: refreshed.session.access_token,
      refreshToken: refreshed.session.refresh_token,
      expiresAt: refreshed.session.expires_at ?? nowSec + 3600,
      remember: session.remember,
    };
    return {
      supabase: createScopedClient(nextSession.accessToken),
      userId: refreshed.user?.id ?? ownerUserId,
      refreshedSession: nextSession,
    };
  }

  const fresh = await signInOwnerSession(session.remember);
  return {
    supabase: fresh.supabase,
    userId: fresh.userId,
    refreshedSession: fresh.session,
  };
}

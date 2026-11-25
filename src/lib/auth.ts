import crypto from "crypto";
import { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "nutri_session";
export const REMEMBER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SessionPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
  remember: boolean;
}

function getSessionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET environment variable is missing or too short.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, expectedHex] = parts;
  const derived = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

export function encryptSession(payload: SessionPayload): string {
  const key = getSessionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptSession(token: string): SessionPayload | null {
  try {
    const key = getSessionKey();
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 12 + 16 + 2) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decrypted) as SessionPayload;
    if (!parsed.accessToken || !parsed.refreshToken || typeof parsed.expiresAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function attachSessionCookie(res: NextResponse, payload: SessionPayload): void {
  const encrypted = encryptSession(payload);
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: encrypted,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(payload.remember ? { maxAge: REMEMBER_MAX_AGE_SECONDS } : {}),
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

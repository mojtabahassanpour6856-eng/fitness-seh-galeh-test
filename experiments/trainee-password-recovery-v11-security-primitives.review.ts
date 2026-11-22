/**
 * REVIEW-ONLY security primitives for recovery Edge Function v11.
 *
 * This file is deliberately outside supabase/functions and is NOT deployed or
 * imported by the active v10 function. It has no database, SMS, or Auth calls.
 *
 * Pepper contract: RECOVERY_TOKEN_PEPPER is base64url encoding of at least
 * 32 cryptographically random bytes, provisioned independently per environment.
 * Never reuse Supabase or Mediana credentials as this key.
 */

const encoder = new TextEncoder();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_256_RE = /^[0-9a-f]{64}$/;

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Generate a uniform value in [0000, 9999], retaining leading zeroes. */
export function generateRecoveryCode(): string {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / 10_000) * 10_000;
  const word = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(word);
    value = word[0];
  } while (value >= limit);
  return String(value % 10_000).padStart(4, "0");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("RECOVERY_TOKEN_PEPPER must be base64url");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("RECOVERY_TOKEN_PEPPER is not valid base64url");
  }
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  if (bytes.length < 32) {
    throw new Error("RECOVERY_TOKEN_PEPPER must contain at least 32 random bytes");
  }
  return bytes;
}

export async function recoveryTokenHmac(
  pepperBase64Url: string,
  requestId: string,
  attemptId: string,
  code: string,
): Promise<string> {
  if (!isCanonicalUuid(requestId) || !isCanonicalUuid(attemptId)) {
    throw new Error("Invalid recovery request or attempt identifier");
  }
  if (!/^\d{4}$/.test(code)) {
    throw new Error("Recovery code must contain exactly four digits");
  }
  const keyBytes = decodeBase64Url(pepperBase64Url);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  // Domain separation and both identifiers prevent cross-request/attempt reuse.
  const message =
    `fitness-seh-galeh:trainee-password-recovery:v1\n${requestId.toLowerCase()}\n${attemptId.toLowerCase()}\n${code}`;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

/** Constant-work comparison for two canonical 32-byte hex MACs. */
export function equalRecoveryMac(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string" ||
      !HEX_256_RE.test(a) || !HEX_256_RE.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Caller contract:
 * - For a wrong code, pass the STORED expected MAC to the atomic failed-attempt
 *   RPC only after confirming the submitted MAC differs.
 * - For a matching code, call claim RPC with the stored MAC. Claim must require
 *   approved + unexpired + attempts < 5 + delivery_state='sent'.
 * - Do not log this MAC, pepper, plaintext code, phone, or password.
 */

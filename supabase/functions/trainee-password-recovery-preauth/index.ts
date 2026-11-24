// CANDIDATE ONLY. Pre-authentication endpoint for trainee password recovery.
// Configure this function with verify_jwt=false ONLY after local tests pass.
// Coach list/review stays in the JWT-protected trainee-password-recovery function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";
import { runPasswordResetAttempt } from "../trainee-password-recovery/reset-attempt.ts";

const allowedOrigin = Deno.env.get("RECOVERY_ALLOWED_ORIGIN") ?? "";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const enc = new TextEncoder();
const dec = new TextDecoder();
const MAX_ATTEMPTS = 5;
const CODE_TTL_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unb64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(s + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
  if (b64url(bytes) !== value) throw new Error("noncanonical base64url");
  return bytes;
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
function requiredKey(name: string, exactLength?: number): Uint8Array {
  const raw = Deno.env.get(name);
  if (!raw) throw new Error("missing server key");
  const bytes = unb64url(raw);
  if (exactLength !== undefined && bytes.length !== exactLength) throw new Error("invalid server key length");
  if (exactLength === undefined && bytes.length < 32) throw new Error("server key too short");
  return bytes;
}
async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", toBuffer(requiredKey("RECOVERY_HMAC_PEPPER_B64URL")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, toBuffer(enc.encode(value)))));
}
async function hashForRateLimit(value: string): Promise<string> {
  return hex(unb64url(await hmac("rate-v1|" + value)));
}
async function consumeLimit(admin: any, key: string, seconds: number, maximum: number): Promise<boolean> {
  const { data, error } = await admin.rpc("consume_registration_rate_limit", {
    p_key_hash: key, p_window_seconds: seconds, p_max_requests: maximum,
  });
  if (error) throw new Error("rate limiter unavailable");
  return data === true;
}
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  let left: Uint8Array, right: Uint8Array;
  try { left = unb64url(a); right = unb64url(b); } catch { return false; }
  if (left.length !== 32 || right.length !== 32) return false;
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
function normalizePhone(value: unknown): string | null {
  let phone = String(value ?? "").trim().replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s()-]/g, "");
  if (phone.startsWith("0098")) phone = "+" + phone.slice(2);
  if (phone.startsWith("98") && !phone.startsWith("+")) phone = "+" + phone;
  if (/^09\d{9}$/.test(phone)) phone = "+98" + phone.slice(1);
  return /^\+989\d{9}$/.test(phone) ? phone : null;
}
function normalizeCode(value: unknown): string {
  return String(value ?? "").trim()
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function randomCode(): string {
  const ceiling = Math.floor(0x100000000 / 10000) * 10000;
  while (true) {
    const word = crypto.getRandomValues(new Uint32Array(1))[0];
    if (word < ceiling) return String(word % 10000).padStart(4, "0");
  }
}
async function codeVerifier(code: string, requestId: string, traineeId: string, expiresAt: string): Promise<string> {
  return await hmac(["recovery-v1", requestId, traineeId, new Date(expiresAt).toISOString(), code].join("|"));
}
function aad(requestId: string, traineeId: string, expiresAt: string): Uint8Array {
  return enc.encode([requestId, traineeId, new Date(expiresAt).toISOString()].join("|"));
}
async function encryptCode(code: string, requestId: string, traineeId: string, expiresAt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", toBuffer(requiredKey("RECOVERY_ENVELOPE_KEY_B64URL", 32)), "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toBuffer(nonce), additionalData: toBuffer(aad(requestId, traineeId, expiresAt)), tagLength: 128 }, key, toBuffer(enc.encode(code)));
  return JSON.stringify({ v: 1, n: b64url(nonce), c: b64url(new Uint8Array(cipher)) });
}
async function decryptCode(value: string, requestId: string, traineeId: string, expiresAt: string): Promise<string> {
  const envelope = JSON.parse(value);
  if (envelope?.v !== 1 || typeof envelope.n !== "string" || typeof envelope.c !== "string") throw new Error("invalid code envelope");
  const nonce = unb64url(envelope.n), cipher = unb64url(envelope.c);
  if (nonce.length !== 12 || cipher.length !== 20) throw new Error("invalid code envelope size");
  const key = await crypto.subtle.importKey("raw", toBuffer(requiredKey("RECOVERY_ENVELOPE_KEY_B64URL", 32)), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toBuffer(nonce), additionalData: toBuffer(aad(requestId, traineeId, expiresAt)), tagLength: 128 }, key, toBuffer(cipher));
  const code = dec.decode(plain);
  if (!/^\d{4}$/.test(code)) throw new Error("invalid code");
  return code;
}
function getClientIp(req: Request): string {
  // Prefer the edge proxy's single-address header. Never store the raw address.
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown").trim().slice(0, 128);
}
function genericRequestResponse() {
  // Same shape for existing, missing, ambiguous, and already-open accounts.
  return json({ success: true, status: "received", message: "اگر اطلاعات با یک حساب فعال مطابقت داشته باشد، درخواست برای بررسی ارسال می‌شود." }, 202);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  if (!allowedOrigin || origin !== allowedOrigin) return new Response("origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "فقط POST مجاز است." }, 405);
  if (Deno.env.get("RECOVERY_NO_SMS_ENABLED") !== "true") return json({ error: "این قابلیت هنوز فعال نشده است." }, 404);

  try {
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ error: "تنظیمات سرور کامل نیست." }, 503);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "request") {
      const phone = normalizePhone(body?.phone);
      const requestId = String(body?.request_id ?? "");
      const claimToken = String(body?.claim_token ?? "");
      if (!phone || !UUID.test(requestId) || unb64url(claimToken).length !== 32) return genericRequestResponse();

      const ipHash = await hashForRateLimit("ip|" + getClientIp(req));
      const phoneHash = await hashForRateLimit("phone|" + phone);
      const [ipAllowed, phoneAllowed] = await Promise.all([
        consumeLimit(admin, ipHash, 3600, 10),
        consumeLimit(admin, phoneHash, 3600, 3),
      ]);
      if (!ipAllowed || !phoneAllowed) return genericRequestResponse();

      const { data: matches, error: lookupError } = await admin.from("trainees")
        .select("id,auth_user_id,coach_user_id,approval_status,phone_normalized")
        .eq("phone_normalized", phone).eq("approval_status", "active").limit(2);
      if (lookupError || !Array.isArray(matches) || matches.length !== 1 || !matches[0].auth_user_id) return genericRequestResponse();
      const trainee = matches[0];

      const { data: openRows, error: openError } = await admin.from("trainee_password_recovery_requests")
        .select("id,status,claim_token_hash,claim_expires_at")
        .eq("trainee_id", trainee.id).in("status", ["pending", "approved", "processing"]).limit(1);
      if (openError || (openRows ?? []).length > 0) return genericRequestResponse();

      const claimHash = await hmac("claim-v1|" + claimToken);
      const claimExpires = new Date(Date.now() + CODE_TTL_MS).toISOString();
      const { error: insertError } = await admin.from("trainee_password_recovery_requests").insert({
        id: requestId,
        trainee_id: trainee.id,
        phone_normalized: trainee.phone_normalized,
        status: "pending",
        claim_token_hash: claimHash,
        claim_expires_at: claimExpires,
        request_ip_hash: ipHash,
        request_phone_hash: phoneHash,
      });
      // Do not reveal uniqueness, lookup, or insert outcomes to an unauthenticated caller.
      if (insertError) return genericRequestResponse();
      return genericRequestResponse();
    }

    if (action === "code" || action === "reset") {
      const requestId = String(body?.request_id ?? "");
      const claimToken = String(body?.claim_token ?? "");
      if (!UUID.test(requestId) || unb64url(claimToken).length !== 32) return json({ error: "درخواست معتبر نیست یا منقضی شده است." }, 400);
      const claimHash = await hmac("claim-v1|" + claimToken);
      const { data: row, error } = await admin.from("trainee_password_recovery_requests")
        .select("id,trainee_id,status,claim_token_hash,claim_expires_at,token_hash,token_expires_at,token_attempts,code_envelope,reset_reconciliation_required,trainees!inner(id,auth_user_id,approval_status)")
        .eq("id", requestId).maybeSingle();
      if (error || !row || row.claim_token_hash !== claimHash || !row.claim_expires_at ||
          new Date(row.claim_expires_at).getTime() <= Date.now()) {
        return json({ error: "درخواست معتبر نیست یا منقضی شده است." }, 400);
      }
      const trainee = Array.isArray(row.trainees) ? row.trainees[0] : row.trainees;
      if (!trainee?.auth_user_id || trainee.approval_status !== "active") return json({ error: "حساب شاگرد فعال نیست." }, 409);

      if (action === "code") {
        const codeRate = await hashForRateLimit("code|" + requestId + "|" + claimHash);
        if (!(await consumeLimit(admin, codeRate, 300, 10))) return json({ error: "تعداد درخواست‌ها بیش از حد مجاز است." }, 429);
        if (row.status !== "approved" || !row.code_envelope || !row.token_expires_at ||
            Number(row.token_attempts) >= MAX_ATTEMPTS || new Date(row.token_expires_at).getTime() <= Date.now()) {
          return json({ error: "کد هنوز صادر نشده یا منقضی شده است." }, 404);
        }
        const code = await decryptCode(row.code_envelope, row.id, row.trainee_id, row.token_expires_at);
        return json({ success: true, code, expires_at: row.token_expires_at });
      }

      const code = normalizeCode(body?.code);
      const password = String(body?.new_password ?? "");
      if (!/^\d{4}$/.test(code) || password.length < 8 || password.length > 128) return json({ error: "کد یا رمز جدید معتبر نیست." }, 400);
      if (!row.token_hash || !row.token_expires_at || Number(row.token_attempts) >= MAX_ATTEMPTS) return json({ error: "کد نامعتبر یا منقضی شده است." }, 400);
      if (row.reset_reconciliation_required === true) return json({ error: "نتیجه تلاش قبلی نامشخص است؛ با پشتیبانی باشگاه تماس بگیرید." }, 409);

      const resetRate = await hashForRateLimit("reset|" + requestId + "|" + claimHash);
      if (!(await consumeLimit(admin, resetRate, 900, 5))) return json({ error: "تعداد تلاش‌ها بیش از حد مجاز است." }, 429);
      const candidate = await codeVerifier(code, row.id, row.trainee_id, row.token_expires_at);
      if (!(await constantTimeEqual(candidate, row.token_hash))) {
        if (row.status !== "approved" || new Date(row.token_expires_at).getTime() <= Date.now()) return json({ error: "کد نامعتبر یا منقضی شده است." }, 400);
        const { data: attempts, error: attemptError } = await admin.rpc("record_trainee_recovery_failed_attempt_no_sms", {
          p_request_id: row.id, p_expected_verifier: row.token_hash,
        });
        if (attemptError || !Array.isArray(attempts) || attempts.length !== 1) return json({ error: "ثبت تلاش ناموفق ممکن نشد." }, 503);
        return json({ error: "کد بازیابی نادرست است." }, 400);
      }
      if (row.status !== "approved" && row.status !== "processing") return json({ error: "این درخواست قابل استفاده نیست." }, 409);

      const attemptId = crypto.randomUUID();
      const result = await runPasswordResetAttempt({
        admin, userId: trainee.auth_user_id, requestId: row.id, attemptId,
        expectedVerifier: row.token_hash, password, leaseSeconds: 120,
      });
      if (result.kind === "lease_error") return json({ error: "دریافت مجوز تغییر رمز ممکن نشد." }, 503);
      if (result.kind === "busy") return json({ error: "عملیات قبلی هنوز در حال پردازش است." }, 409);
      if (result.kind === "blocked_unknown_outcome") return json({ error: "نتیجه تلاش قبلی نامشخص است؛ با پشتیبانی تماس بگیرید." }, 409);
      if (result.kind === "invalid") return json({ error: "کد یا مهلت بازیابی معتبر نیست." }, 409);
      if (result.kind === "auth_rejected" && result.leaseReleaseFailed) return json({ error: "تغییر رمز رد شد اما آزادسازی امن تأیید نشد؛ با پشتیبانی تماس بگیرید." }, 503);
      if (result.kind === "auth_rejected") return json({ error: "رمز پیشنهادی پذیرفته نشد؛ رمز دیگری انتخاب کنید." }, 400);
      if (result.kind === "auth_unknown") return json({ error: "نتیجه تغییر رمز نامشخص است؛ تلاش مجدد مسدود شد." }, 503);
      if (result.kind === "completion_pending") return json({ success: true, completion_pending: true, message: "تغییر رمز ممکن است انجام شده باشد؛ دوباره تلاش نکنید و با پشتیبانی تماس بگیرید." }, 503);

      // One-time claim invalidation follows successful completion.
      const { error: clearError } = await admin.from("trainee_password_recovery_requests")
        .update({ claim_token_hash: null, claim_expires_at: null, request_ip_hash: null, request_phone_hash: null })
        .eq("id", requestId).eq("status", "completed");
      if (clearError) console.error("recovery claim cleanup pending");
      return json({ success: true, message: "رمز جدید با موفقیت ثبت شد." });
    }
    return json({ error: "عملیات نامعتبر است." }, 400);
  } catch (error) {
    console.error("pre-auth recovery failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "درخواست قابل پردازش نیست." }, 400);
  }
});

// CANDIDATE ONLY. Do not deploy until migration and integration tests are reviewed.
// No SMS/email/provider calls. Every action requires a valid Supabase user JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const enc = new TextEncoder();
const dec = new TextDecoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hex(bytes: Uint8Array): string { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unb64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("bad base64url");
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const out = Uint8Array.from(atob(s + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
  if (b64url(out) !== value) throw new Error("noncanonical base64url");
  return out;
}
function requiredSecret(name: string, length?: number): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("missing server secret");
  if (length !== undefined && unb64url(value).length !== length) throw new Error("invalid server key length");
  return value;
}
function randomFourDigitCode(): string {
  // Rejection sampling avoids modulo bias; keep leading zeroes.
  const ceiling = Math.floor(0x100000000 / 10000) * 10000;
  while (true) {
    const word = crypto.getRandomValues(new Uint32Array(1))[0];
    if (word < ceiling) return String(word % 10000).padStart(4, "0");
  }
}
async function hmacVerifier(code: string, requestId: string, traineeId: string, expiresAt: string): Promise<string> {
  const pepper = unb64url(requiredSecret("RECOVERY_HMAC_PEPPER_B64URL"));
  if (pepper.length < 32) throw new Error("pepper too short");
  const key = await crypto.subtle.importKey("raw", pepper, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(["recovery-v1", requestId, traineeId, new Date(expiresAt).toISOString(), code].join("|")));
  return b64url(new Uint8Array(signature));
}
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  // Compare fixed-size digests without early exit.
  let aa: Uint8Array, bb: Uint8Array;
  try { aa = unb64url(a); bb = unb64url(b); } catch { return false; }
  if (aa.length !== 32 || bb.length !== 32) return false;
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
function aad(requestId: string, traineeId: string, expiresAt: string): Uint8Array {
  const iso = new Date(expiresAt);
  if (!Number.isFinite(iso.getTime())) throw new Error("invalid expiry");
  return enc.encode([requestId, traineeId, iso.toISOString()].join("|"));
}
async function encryptEnvelope(code: string, requestId: string, traineeId: string, expiresAt: string) {
  const rawKey = unb64url(requiredSecret("RECOVERY_ENVELOPE_KEY_B64URL", 32));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(requestId, traineeId, expiresAt), tagLength: 128 }, key, enc.encode(code));
  return JSON.stringify({ v: 1, n: b64url(nonce), c: b64url(new Uint8Array(cipher)) });
}
async function decryptEnvelope(value: string, requestId: string, traineeId: string, expiresAt: string): Promise<string> {
  const envelope = JSON.parse(value);
  if (envelope?.v !== 1 || typeof envelope.n !== "string" || typeof envelope.c !== "string") throw new Error("invalid envelope");
  const nonce = unb64url(envelope.n), cipher = unb64url(envelope.c);
  if (nonce.length !== 12 || cipher.length !== 20) throw new Error("invalid envelope size");
  const key = await crypto.subtle.importKey("raw", unb64url(requiredSecret("RECOVERY_ENVELOPE_KEY_B64URL", 32)), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(requestId, traineeId, expiresAt), tagLength: 128 }, key, cipher);
  const code = dec.decode(plain);
  if (!/^\d{4}$/.test(code)) throw new Error("invalid code payload");
  return code;
}
async function enforceRateLimit(admin: any, userId: string, action: string, windowSeconds: number, maxRequests: number): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(["recovery-v1", action, userId].join("|")));
  const keyHash = hex(new Uint8Array(digest));
  const { data, error } = await admin.rpc("consume_registration_rate_limit", {
    p_key_hash: keyHash, p_window_seconds: windowSeconds, p_max_requests: maxRequests,
  });
  if (error) throw new Error("rate limit unavailable");
  return data === true;
}
function normalizeCode(value: unknown): string {
  return String(value ?? "").trim()
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  if (!allowedOrigin || (origin && origin !== allowedOrigin)) return new Response("origin not allowed", { status: 403, headers: { "Vary": "Origin" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "فقط POST مجاز است." }, 405);
  // Explicit opt-in required even in the mirror environment. Missing flag means disabled.
  if (Deno.env.get("RECOVERY_NO_SMS_ENABLED") !== "true") return json({ error: "این قابلیت هنوز فعال نشده است." }, 404);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ error: "تنظیمات سرور کامل نیست." }, 503);
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "نشست معتبر نیست." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "نشست معتبر نیست." }, 401);
    const userId = authData.user.id;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json();
    const action = String(body?.action ?? "");

    // Resolve trainee identity exclusively from the authenticated JWT; never trust client phone/trainee_id.
    const { data: trainee, error: traineeError } = await admin.from("trainees")
      .select("id,auth_user_id,coach_user_id,approval_status,phone_normalized")
      .eq("auth_user_id", userId).eq("approval_status", "active").maybeSingle();

    if (["request", "code", "reset"].includes(action)) {
      if (traineeError || !trainee) return json({ error: "حساب شاگرد فعال پیدا نشد." }, 403);
      if (!trainee.phone_normalized || !/^\+989[0-9]{9}$/.test(trainee.phone_normalized)) return json({ error: "شماره ثبت‌شده حساب معتبر نیست؛ با مربی تماس بگیرید." }, 409);
    }

    if (action === "request") {
      const rateKey = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("recovery-request|" + userId))));
      const { data: allowed, error: rateError } = await admin.rpc("consume_registration_rate_limit", {
        p_key_hash: rateKey, p_window_seconds: 3600, p_max_requests: 3,
      });
      if (rateError || allowed !== true) return json({ error: "درخواست بیش از حد مجاز است؛ بعداً تلاش کنید." }, rateError ? 503 : 429);
      const { data: openRequest, error: openError } = await admin.from("trainee_password_recovery_requests")
        .select("id").eq("trainee_id", trainee.id).in("status", ["pending", "approved", "processing"]).limit(1).maybeSingle();
      if (openError) return json({ error: "ثبت درخواست ممکن نیست." }, 503);
      if (openRequest) return json({ success: true, request_id: openRequest.id, status: "in_progress" });
      const { data: inserted, error: insertError } = await admin.from("trainee_password_recovery_requests")
        .insert({ trainee_id: trainee.id, phone_normalized: trainee.phone_normalized, status: "pending" })
        .select("id").single();
      if (insertError) return json({ error: "ثبت درخواست انجام نشد." }, 503);
      return json({ success: true, request_id: inserted.id, status: "pending" }, 201);
    }

    if (action === "list" || action === "review") {
      const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (profileError || profile?.role !== "coach") return json({ error: "فقط مربی مجاز است." }, 403);
      if (action === "list") {
        const { data, error } = await admin.from("trainee_password_recovery_requests")
          .select("id,trainee_id,status,requested_at,trainees!inner(full_name,coach_user_id)")
          .eq("status", "pending").eq("trainees.coach_user_id", userId).order("requested_at").limit(50);
        if (error) return json({ error: "دریافت درخواست‌ها ناموفق بود." }, 503);
        return json({ success: true, requests: data ?? [] });
      }
      const requestId = String(body?.request_id ?? "");
      const decision = String(body?.decision ?? "");
      if (!UUID.test(requestId) || !["approve", "reject"].includes(decision)) return json({ error: "درخواست نامعتبر است." }, 400);
      const { data: row, error: rowError } = await admin.from("trainee_password_recovery_requests")
        .select("id,trainee_id,status,trainees!inner(id,auth_user_id,coach_user_id,approval_status)")
        .eq("id", requestId).maybeSingle();
      if (rowError || !row || row.status !== "pending") return json({ error: "درخواست پیدا نشد یا قبلاً بررسی شده است." }, 409);
      const linked = Array.isArray(row.trainees) ? row.trainees[0] : row.trainees;
      if (!linked || linked.coach_user_id !== userId || linked.approval_status !== "active" || !linked.auth_user_id)
        return json({ error: "این درخواست متعلق به شاگرد فعال شما نیست." }, 403);
      if (decision === "reject") {
        const { data: changed, error } = await admin.from("trainee_password_recovery_requests")
          .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: userId, updated_at: new Date().toISOString() })
          .eq("id", requestId).eq("status", "pending").select("id").maybeSingle();
        return error || !changed ? json({ error: "رد درخواست انجام نشد." }, 503) : json({ success: true, status: "rejected" });
      }
      const code = randomFourDigitCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
      const [verifier, envelope] = await Promise.all([
        hmacVerifier(code, requestId, linked.id, expiresAt),
        encryptEnvelope(code, requestId, linked.id, expiresAt),
      ]);
      const { data: changed, error } = await admin.from("trainee_password_recovery_requests").update({
        status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: userId,
        token_hash: verifier, token_expires_at: expiresAt, token_attempts: 0,
        code_envelope: envelope, updated_at: new Date().toISOString(),
      }).eq("id", requestId).eq("status", "pending").select("id").maybeSingle();
      if (error || !changed) return json({ error: "تأیید درخواست انجام نشد." }, 503);
      // Deliberately do not return or log the code to the coach.
      return json({ success: true, status: "approved", expires_at: expiresAt });
    }

    if (action === "code") {
      if (!(await enforceRateLimit(admin, userId, "code", 300, 10))) return json({ error: "درخواست دریافت کد بیش از حد مجاز است." }, 429);
      const requestId = String(body?.request_id ?? "");
      if (!UUID.test(requestId)) return json({ error: "درخواست نامعتبر است." }, 400);
      const { data: row, error } = await admin.from("trainee_password_recovery_requests")
        .select("id,trainee_id,status,token_expires_at,code_envelope,token_attempts")
        .eq("id", requestId).eq("trainee_id", trainee.id).maybeSingle();
      if (error || !row || row.status !== "approved" || Number(row.token_attempts) >= MAX_ATTEMPTS ||
          !row.code_envelope || !row.token_expires_at || new Date(row.token_expires_at).getTime() <= Date.now())
        return json({ error: "کد هنوز صادر نشده یا منقضی شده است." }, 404);
      const code = await decryptEnvelope(row.code_envelope, row.id, trainee.id, row.token_expires_at);
      return json({ success: true, code, expires_at: row.token_expires_at });
    }

    if (action === "reset") {
      if (!(await enforceRateLimit(admin, userId, "reset", 900, 5))) return json({ error: "تلاش برای تغییر رمز بیش از حد مجاز است." }, 429);
      const requestId = String(body?.request_id ?? "");
      const code = normalizeCode(body?.code);
      const password = String(body?.new_password ?? "");
      if (!UUID.test(requestId) || !/^\d{4}$/.test(code) || password.length < 8 || password.length > 128)
        return json({ error: "درخواست، کد یا رمز جدید معتبر نیست." }, 400);
      const { data: row, error } = await admin.from("trainee_password_recovery_requests")
        .select("id,trainee_id,status,token_hash,token_expires_at,token_attempts")
        .eq("id", requestId).eq("trainee_id", trainee.id).maybeSingle();
      if (error || !row || row.status !== "approved" || !row.token_hash || !row.token_expires_at ||
          new Date(row.token_expires_at).getTime() <= Date.now() || Number(row.token_attempts) >= MAX_ATTEMPTS)
        return json({ error: "کد نامعتبر یا منقضی شده است." }, 400);
      const candidate = await hmacVerifier(code, row.id, trainee.id, row.token_expires_at);
      if (!(await constantTimeEqual(candidate, row.token_hash))) {
        const { error: attemptError } = await admin.rpc("record_trainee_recovery_failed_attempt_no_sms", {
          p_request_id: row.id, p_expected_verifier: row.token_hash,
        });
        if (attemptError) return json({ error: "ثبت تلاش ناموفق ممکن نشد؛ دوباره تلاش نکنید و با مربی تماس بگیرید." }, 503);
        return json({ error: "کد بازیابی نادرست است." }, 400);
      }
      const { data: claimed, error: claimError } = await admin.rpc("claim_trainee_recovery_code_no_sms", {
        p_request_id: row.id, p_expected_verifier: row.token_hash,
      });
      if (claimError || claimed !== true) return json({ error: "کد منقضی شده یا قبلاً در حال مصرف است." }, 409);
      const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
      if (passwordError) {
        // Fail closed: leave status=processing. Never reopen a code after an ambiguous Auth failure.
        console.error("recovery auth update failed", passwordError.message);
        return json({ error: "نتیجه تغییر رمز قطعی نیست؛ برای جلوگیری از مصرف دوباره کد، درخواست قفل شده است. با مربی تماس بگیرید." }, 503);
      }
      const { error: finishError } = await admin.from("trainee_password_recovery_requests").update({
        status: "completed", completed_at: new Date().toISOString(), token_hash: null,
        token_expires_at: null, code_envelope: null, updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "processing").eq("token_hash", row.token_hash);
      if (finishError) {
        console.error("recovery completion marker failed", finishError.message);
        return json({ success: true, completion_pending: true, message: "رمز تغییر کرد؛ ثبت نهایی وضعیت در حال پیگیری است." });
      }
      return json({ success: true, message: "رمز جدید با موفقیت ثبت شد." });
    }
    return json({ error: "عملیات نامعتبر است." }, 400);
  } catch (error) {
    console.error("trainee-password-recovery candidate failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "درخواست قابل پردازش نیست." }, 400);
  }
});

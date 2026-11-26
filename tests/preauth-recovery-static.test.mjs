import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const preauth = readFileSync("supabase/functions/trainee-password-recovery-preauth/index.ts", "utf8");
const coach = readFileSync("supabase/functions/trainee-password-recovery/index.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");
const migration = readFileSync("supabase/migrations/202611240002_pre_auth_recovery_claims.sql", "utf8");
const authShell = readFileSync("auth-preview/connected-auth.js", "utf8");
const rootSw = readFileSync("sw.js", "utf8");

assert.match(config, /\[functions\.trainee-password-recovery-preauth\][\s\S]*?verify_jwt\s*=\s*false/);
assert.match(config, /\[functions\.trainee-password-recovery\][\s\S]*?verify_jwt\s*=\s*true/, "coach recovery endpoint must retain gateway JWT verification");
assert.doesNotMatch(preauth, /auth\.getUser\s*\(/, "pre-auth handler must not depend on a trainee JWT");
assert.match(preauth, /claim_token_hash/);
assert.match(preauth, /claim_expires_at/);
assert.match(preauth, /constantTimeEqual\s*\(/);
assert.match(preauth, /CODE_TTL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, "pre-auth recovery code must expire after 24 hours");
assert.match(preauth, /CLAIM_TTL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, "browser claim must remain available for 24 hours");
assert.match(preauth, /record_trainee_recovery_failed_attempt_no_sms/);
assert.match(preauth, /runPasswordResetAttempt\s*\(/);
assert.match(preauth, /consume_registration_rate_limit/);
assert.match(preauth, /matches\.length\s*!==\s*1/, "ambiguous phone matches must fail closed");
assert.match(coach, /auth\.getUser\s*\(/, "coach endpoint must retain JWT validation");
assert.match(coach, /coach_user_id/);
assert.match(coach, /CODE_TTL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
assert.match(coach, /claim_expires_at:\s*expiresAt/, "coach approval must keep the browser claim valid for the full code window");
assert.doesNotMatch(coach, /recovery_code\s*:/, "coach endpoint must not return the recovery code");
assert.match(migration, /claim_token_hash/);
assert.match(migration, /request_ip_hash/);
assert.match(migration, /request_phone_hash/);


const html = readFileSync("index.html", "utf8");
const uiStart = html.indexOf('<script id="seh-password-recovery-ui-20261017">');
assert.ok(uiStart >= 0, "recovery UI script must exist");
const uiBodyStart = html.indexOf(">", uiStart) + 1;
const uiEnd = html.indexOf("</script>", uiBodyStart);
assert.ok(uiEnd > uiBodyStart, "recovery UI script must close");
const uiScript = html.slice(uiBodyStart, uiEnd);
assert.doesNotThrow(() => new Function(uiScript), "recovery UI must parse");
assert.match(uiScript, /trainee-password-recovery-preauth/);
assert.match(uiScript, /sessionStorage/);
assert.match(uiScript, /existing&&existing\.phone===phone/, "browser claim must be bound to normalized phone");
assert.match(uiScript, /crypto\.getRandomValues/);
assert.match(uiScript, /sehRecoveryFetchCodeBtn/);
assert.doesNotMatch(uiScript, /data\.recovery_code/, "coach UI must never display a recovery code");

test("short mobile auth screens keep choice images readable and the page scrollable", () => {
  assert.match(authShell, /@media \\(max-height:760px\\)\\{#authScreen \\.auth-card\\{min-height:100dvh!important;height:auto!important;max-height:none!important;overflow:visible!important/);
  assert.match(authShell, /@media \\(max-height:760px\\)\\{#authScreen \\.seh-art\\{width:88px!important;height:88px!important;flex-basis:88px!important/);
  assert.match(authShell, /@media \\(max-height:620px\\)\\{#authScreen \\.seh-art\\{width:76px!important;height:76px!important;flex-basis:76px!important/);
  assert.doesNotThrow(() => new Function(authShell), "connected auth redesign must parse");
});

test("root service-worker shell cache is versioned past the stale v13 cache", () => {
  assert.match(rootSw, /seh-shell-v14/);
  assert.doesNotMatch(rootSw, /seh-shell-v13/);
});

console.log("PASS: pre-auth recovery and browser UI static security contract");

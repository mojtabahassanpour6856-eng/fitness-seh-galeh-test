import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const preauth = readFileSync("supabase/functions/trainee-password-recovery-preauth/index.ts", "utf8");
const coach = readFileSync("supabase/functions/trainee-password-recovery/index.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");
const migration = readFileSync("supabase/migrations/202611240002_pre_auth_recovery_claims.sql", "utf8");

assert.match(config, /\[functions\.trainee-password-recovery-preauth\][\s\S]*?verify_jwt\s*=\s*false/);
assert.doesNotMatch(preauth, /auth\.getUser\s*\(/, "pre-auth handler must not depend on a trainee JWT");
assert.match(preauth, /claim_token_hash/);
assert.match(preauth, /claim_expires_at/);
assert.match(preauth, /constantTimeEqual\s*\(/);
assert.match(preauth, /record_trainee_recovery_failed_attempt_no_sms/);
assert.match(preauth, /runPasswordResetAttempt\s*\(/);
assert.match(preauth, /consume_registration_rate_limit/);
assert.match(preauth, /matches\.length\s*!==\s*1/, "ambiguous phone matches must fail closed");
assert.match(coach, /auth\.getUser\s*\(/, "coach endpoint must retain JWT validation");
assert.match(coach, /coach_user_id/);
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
assert.match(uiScript, /crypto\.getRandomValues/);
assert.match(uiScript, /sehRecoveryFetchCodeBtn/);
assert.doesNotMatch(uiScript, /data\.recovery_code/, "coach UI must never display a recovery code");

console.log("PASS: pre-auth recovery and browser UI static security contract");

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('auth-preview/recovery-ui-preview.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const auth = readFileSync('auth-preview/connected-auth.js', 'utf8');

assert.doesNotThrow(() => new Function(ui), 'recovery preview module must parse');
assert.doesNotThrow(() => new Function(auth), 'connected auth shell must parse');
assert.match(html, /auth-preview\/recovery-ui-preview\.js\?v=/, 'index must load the isolated preview module');
assert.ok(html.indexOf('recovery-ui-preview.js') < html.indexOf('<script src="./auth-preview/connected-auth.js'), 'recovery initializer must run before auth shell mounting');
assert.doesNotMatch(ui, /functions\.invoke|fetch\s*\(/, 'preview UI must not make backend requests');
assert.match(ui, /disabled/, 'all recovery actions remain disabled in the preview stage');
assert.match(ui, /sehRecoveryStudentPanel/);
assert.match(ui, /sehCoachRecoveryPanel/);
assert.match(ui, /کد ۴ رقمی یک‌بارمصرف/);
assert.match(ui, /۲۴ ساعت اعتبار دارد/);
assert.match(ui, /همین مرورگری/);
assert.match(ui, /مربی به خود کد دسترسی ندارد/);
assert.match(ui, /مرحله ۱: ثبت درخواست بازیابی/);
assert.match(ui, /مرحله ۲: دریافت کد پس از تأیید مربی/);
assert.doesNotMatch(ui, /کد ۸ رقمی/);
assert.match(auth, /sehAuthRecovery/);
assert.match(auth, /sehRecoveryStudentPanel/);
const registrationStart = html.indexOf('const name=visibleField("traineeRegName")');
assert.ok(registrationStart >= 0, 'authoritative trainee registration handler must be present');
const registrationEnd = html.indexOf('  async function loadDeviceLinkRequests()', registrationStart);
assert.ok(registrationEnd > registrationStart, 'registration handler boundary must be present');
const registrationBlock = html.slice(registrationStart, registrationEnd);
assert.match(registrationBlock, /درخواست شما با موفقیت برای مربی ارسال شد/, 'successful registration must show clear confirmation');
assert.match(html, /function registrationStatus\(text,ok=false\)/, 'registration feedback must be mounted in the visible registration form');
assert.match(registrationBlock, /registrationStatus\("✅ درخواست شما با موفقیت برای مربی ارسال شد\./, 'successful registration must show confirmation in the visible form');
assert.match(html, /const mount=document\.getElementById\("sehRegisterMount"\)/, 'registration feedback must target the dedicated mounted registration panel');
assert.match(html, /mount\?\.querySelector\("\.seh-reg-block"\)/, 'registration feedback must stay inside the moved registration block');
assert.match(html, /data-seh-registration-status/, 'feedback must use a unique status marker instead of duplicate legacy ids');
assert.match(html, /setProperty\("visibility","visible","important"\)/, 'feedback visibility must override inherited hidden styling');
assert.doesNotMatch(registrationBlock, /\["traineeRegName","traineeRegPhone","traineeRegSessions"/, 'profile fields must not be cleared after success');
assert.match(registrationBlock, /traineeRegPassword.*?\.value=""/s, 'password fields must be cleared after successful submission');
assert.match(auth, /trainee-entry\.webp/);
assert.match(auth, /coach-entry\.webp/);
assert.match(auth, /seh-recovery-preview-notice|sehRecoveryStudentPanel/);

const connected = readFileSync('auth-preview/recovery-ui-connected.js', 'utf8');
assert.doesNotThrow(() => new Function(connected), 'connected recovery module must parse');
assert.ok(html.includes('auth-preview/recovery-ui-connected.js?v='), 'index must load the gated integration module');
assert.ok(connected.includes('window.SEH_RECOVERY_CONNECTED_ENABLED === true'), 'integration must require an explicit release flag');
assert.doesNotMatch(connected, /localStorage/, 'claim token must never be persisted in localStorage');
assert.ok(connected.includes('sessionStorage.setItem'), 'claim token must be scoped to the current browser session');
assert.ok(connected.includes('crypto.randomUUID()'), 'request ID must be generated with a cryptographic UUID');
assert.ok(connected.includes('new Uint8Array(32)'), 'claim token must contain 32 random bytes');
assert.ok(connected.includes('trainee-password-recovery-preauth'), 'student requests must use the pre-auth endpoint');
assert.ok(connected.includes('/functions/v1/trainee-password-recovery\''), 'coach actions must use the JWT-protected endpoint');
assert.ok(connected.includes('auth.getSession()'), 'coach actions must use the current authenticated session');
for (const action of ["action:'request'","action:'code'","action:'reset'","action:'list'","action:'review'"]) {
  assert.ok(connected.includes(action), 'missing recovery action contract: ' + action);
}
assert.doesNotMatch(connected, /service_role|SUPABASE_SERVICE_ROLE_KEY/, 'client module must never contain a service-role credential');
assert.doesNotMatch(connected, /console\.(log|debug)\(/, 'sensitive recovery data must not be logged');
assert.ok(connected.includes('window.AUTH_SUPABASE'), 'coach requests must reuse the shared Supabase client');
assert.ok(connected.includes('decision:button.dataset.decision'), 'coach decision must be sent from the approved action controls');
assert.ok(connected.includes('sehCoachRecoveryList'), 'coach request list must be rendered in its own container');
const coachUi = connected.slice(connected.indexOf('async function coachRefresh'), connected.indexOf("document.addEventListener('click'"));
assert.doesNotMatch(coachUi, /result\.code|claim_token|new_password/, 'coach UI must never receive or render recovery secrets');


assert.ok(connected.includes('function readClaims()'), 'recovery claims must be stored as a phone-keyed session map');
assert.ok(connected.includes('claims[value.phone]=value'), 'a new phone request must not overwrite another phone claim');
assert.ok(connected.includes('const claims=readClaims(), value=claims[phone]'), 'retries must reuse the claim for the same normalized phone');
assert.ok(connected.includes('clearClaim(claim.phone)'), 'successful reset must clear only the completed phone claim');
assert.ok(connected.includes('value.request_id') && connected.includes('value.claim_token') && connected.includes('return {[value.phone]:value}'), 'legacy single-claim session data must remain recoverable after migration');
assert.ok(connected.includes('sessionStorage.removeItem(STORE_KEY)'), 'session claims must be cleared from the current tab after completion');

console.log('PASS: isolated recovery UI preview; no backend calls; WebP auth assets preserved');

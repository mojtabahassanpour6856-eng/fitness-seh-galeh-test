import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const origin = process.env.RECOVERY_ALLOWED_ORIGIN;
assert.ok(url && anon && service && origin, 'local Supabase environment is required');
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):/, 'refusing to test against a remote Supabase project');
assert.equal(origin, url, 'browser origin must match the recovery CORS allowlist');

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = crypto.randomUUID();
const initialPassword = 'Initial-Strong-Password-2026!';
const newPassword = 'Browser-Reset-Strong-2026!';
const created = [];
async function createUser(label, role) {
  const email = label + '-' + suffix + '@example.test';
  const { data, error } = await admin.auth.admin.createUser({ email, password: initialPassword, email_confirm: true });
  assert.ok(!error && data.user, 'could not create isolated fixture user: ' + error?.message);
  created.push(data.user.id);
  const profile = await admin.from('profiles').insert({ id: data.user.id, role });
  assert.ok(!profile.error, 'could not create fixture profile: ' + profile.error?.message);
  return { id: data.user.id, email };
}
const browser = await chromium.launch({ headless: true });
try {
  const coach = await createUser('browser-coach', 'coach');
  const traineeA = await createUser('browser-trainee-a', 'trainee');
  const traineeB = await createUser('browser-trainee-b', 'trainee');
  const link = await admin.from('trainees').insert([
    { full_name: 'شاگرد مرورگر آزمایشی A', auth_user_id: traineeA.id, coach_user_id: coach.id, phone_normalized: '+989120000011', approval_status: 'active' },
    { full_name: 'شاگرد مرورگر آزمایشی B', auth_user_id: traineeB.id, coach_user_id: coach.id, phone_normalized: '+989120000012', approval_status: 'active' },
  ]);
  assert.ok(!link.error, 'could not link browser fixture trainees: ' + link.error?.message);

  const coachClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await coachClient.auth.signInWithPassword({ email: coach.email, password: initialPassword });
  assert.ok(login.data.session && !login.error, 'coach fixture could not sign in');
  const coachToken = login.data.session.access_token;

  const page = await browser.newPage();
  await page.goto(url + '/functions/v1/trainee-password-recovery-preauth');
  await page.setContent(`
    <section id="sehRecoveryStudentPanel">
      <input id="sehRecoveryPhone" value="09120000011">
      <button id="sehRecoveryRequestBtn">ثبت درخواست</button><div id="sehRecoveryRequestStatus" role="status"></div>
      <button id="sehRecoveryFetchCodeBtn">دریافت کد</button><div id="sehRecoveryCodeStatus" role="status"></div>
      <input id="sehRecoveryCode"><input id="sehRecoveryNewPassword" type="password"><input id="sehRecoveryNewPassword2" type="password">
      <button id="sehRecoveryResetBtn">ثبت رمز جدید</button><div id="sehRecoveryResetStatus" role="status"></div>
    </section>
    <section id="sehCoachRecoveryPanel"><div class="registration-requests-heading"><button type="button">به‌روزرسانی</button></div></section>
  `);
  await page.evaluate(({ url, anon, coachToken }) => {
    window.SEH_RECOVERY_CONNECTED_ENABLED = true;
    window.SUPABASE_URL = url;
    window.SUPABASE_KEY = anon;
    window.authProfile = { role: 'coach' };
    window.AUTH_SUPABASE = { auth: { getSession: async () => ({ data: { session: { access_token: coachToken } } }) } };
  }, { url, anon, coachToken });
  await page.addScriptTag({ path: fileURLToPath(new URL('../auth-preview/recovery-ui-connected.js', import.meta.url)) });

  await page.locator('#sehRecoveryRequestBtn').click();
  await page.waitForFunction(() => document.querySelector('#sehRecoveryRequestStatus').textContent.includes('درخواست شما'));
  assert.match(await page.locator('#sehRecoveryRequestStatus').textContent(), /ارسال شد/);

  await page.locator('#sehCoachRecoveryRefreshBtn').click();
  await page.getByText('شاگرد مرورگر آزمایشی A').waitFor();
  assert.equal(await page.locator('#sehCoachRecoveryList').getByText('شاگرد مرورگر آزمایشی A').count(), 1);
  assert.doesNotMatch(await page.locator('#sehCoachRecoveryList').innerText(), /کد\s*[:：]/, 'coach UI must not display a recovery code');
  await page.locator('#sehCoachRecoveryList').getByRole('button', { name: 'تأیید درخواست' }).click();
  await page.waitForFunction(() => document.querySelector('#sehCoachRecoveryList').textContent.includes('درخواست در انتظار بررسی وجود ندارد'));

  await page.locator('#sehRecoveryFetchCodeBtn').click();
  await page.waitForFunction(() => /^\d{4}$/.test(document.querySelector('#sehRecoveryCode').value));
  const recoveryCode = await page.locator('#sehRecoveryCode').inputValue();
  await page.locator('#sehRecoveryNewPassword').fill(newPassword);
  await page.locator('#sehRecoveryNewPassword2').fill(newPassword);
  await page.locator('#sehRecoveryResetBtn').click();
  await page.waitForFunction(() => document.querySelector('#sehRecoveryResetStatus').textContent.includes('با موفقیت'));
  assert.equal(await page.evaluate(() => sessionStorage.getItem('seh.recovery.claim.v1')), null);
  assert.equal(await page.locator('#sehRecoveryCode').inputValue(), '');
  assert.equal(await page.locator('#sehRecoveryNewPassword').inputValue(), '');

  const rows = await admin.from('trainee_password_recovery_requests')
    .select('status,token_hash,code_envelope,claim_token_hash,claim_expires_at')
    .eq('phone_normalized', '+989120000011').order('requested_at', { ascending: false }).limit(1);
  assert.ok(!rows.error && rows.data.length === 1, 'recovery request row missing');
  assert.equal(rows.data[0].status, 'completed');
  assert.equal(rows.data[0].token_hash, null);
  assert.equal(rows.data[0].code_envelope, null);
  assert.equal(rows.data[0].claim_token_hash, null);
  assert.equal(rows.data[0].claim_expires_at, null);

  const traineeAuth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const oldLogin = await traineeAuth.auth.signInWithPassword({ email: traineeA.email, password: initialPassword });
  assert.ok(oldLogin.error, 'old trainee password still authenticates');
  const newLogin = await traineeAuth.auth.signInWithPassword({ email: traineeA.email, password: newPassword });
  assert.ok(newLogin.data.session && !newLogin.error, 'new trainee password does not authenticate');
  console.log('PASS: Chromium UI -> local Edge Functions -> disposable Postgres/GoTrue; coach approval, code retrieval, password reset, secret cleanup, and real sign-in verified. Code was not exposed to coach.');
} finally {
  await browser.close();
  for (const id of created.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error('browser fixture cleanup failed: ' + error.message);
  }
}

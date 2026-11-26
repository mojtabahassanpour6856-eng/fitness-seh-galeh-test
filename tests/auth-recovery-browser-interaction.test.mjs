import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const seen = [];
  await page.addInitScript(() => {
    window.SEH_RECOVERY_CONNECTED_ENABLED = true;
    window.SUPABASE_URL = 'https://fixture.invalid';
    window.SUPABASE_KEY = 'fixture-public-key';
    window.authProfile = { role: 'coach' };
    window.AUTH_SUPABASE = { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-coach-token' } } }) } };
  });
  await page.route('https://fixture.invalid/**', async route => {
    const body = route.request().postDataJSON();
    seen.push({ body, authorization: route.request().headers().authorization });
    let result = {};
    if (body.action === 'request') result = { success: true, status: 'pending' };
    if (body.action === 'code') result = { success: true, code: '4826', expires_at: new Date(Date.now()+3600000).toISOString() };
    if (body.action === 'reset') result = { success: true, message: 'رمز جدید با موفقیت ثبت شد.' };
    if (body.action === 'list') result = { success: true, requests: [{ id: 'fixture-request', requested_at: '2026-11-26T10:00:00Z', trainees: { full_name: 'شاگرد آزمایشی' } }] };
    if (body.action === 'review') result = { success: true, status: 'approved' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.setContent(`
    <section id="sehRecoveryStudentPanel">
      <input id="sehRecoveryPhone" value="09120000011">
      <button id="sehRecoveryRequestBtn">درخواست</button><div id="sehRecoveryRequestStatus"></div>
      <button id="sehRecoveryFetchCodeBtn">دریافت کد</button><div id="sehRecoveryCodeStatus"></div>
      <input id="sehRecoveryCode"><input id="sehRecoveryNewPassword"><input id="sehRecoveryNewPassword2">
      <button id="sehRecoveryResetBtn">ثبت</button><div id="sehRecoveryResetStatus"></div>
    </section>
    <section id="sehCoachRecoveryPanel"><div class="registration-requests-heading"><button>به‌روزرسانی</button></div></section>`);
  await page.evaluate(() => {
    window.SEH_RECOVERY_CONNECTED_ENABLED = true;
    window.SUPABASE_URL = 'https://fixture.invalid';
    window.SUPABASE_KEY = 'fixture-public-key';
    window.authProfile = { role: 'coach' };
    window.AUTH_SUPABASE = { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-coach-token' } } }) } };
  });
  await page.addScriptTag({ path: 'auth-preview/recovery-ui-connected.js' });
  await page.locator('#sehRecoveryRequestBtn').click();
  await page.waitForFunction(() => document.querySelector('#sehRecoveryRequestStatus').textContent.includes('ارسال شد'));
  await page.locator('#sehRecoveryFetchCodeBtn').click();
  await page.waitForFunction(() => document.querySelector('#sehRecoveryCode').value === '4826');
  await page.locator('#sehRecoveryNewPassword').fill('fixture-password-123');
  await page.locator('#sehRecoveryNewPassword2').fill('fixture-password-123');
  await page.locator('#sehRecoveryResetBtn').click();
  await page.waitForFunction(() => document.querySelector('#sehRecoveryResetStatus').textContent.includes('با موفقیت'));
  assert.equal(await page.evaluate(() => sessionStorage.getItem('seh.recovery.claim.v1')), null);
  await page.locator('#sehCoachRecoveryRefreshBtn').click();
  await page.getByText('شاگرد آزمایشی').waitFor();
  assert.equal(await page.locator('#sehCoachRecoveryList').getByText('4826').count(), 0);
  await page.locator('#sehCoachRecoveryList').getByRole('button', { name: 'تأیید درخواست' }).click();
  assert.ok(seen.some(x => x.body.action === 'request'));
  assert.ok(seen.some(x => x.body.action === 'code'));
  assert.ok(seen.some(x => x.body.action === 'reset'));
  assert.ok(seen.some(x => x.body.action === 'list' && x.authorization === 'Bearer fixture-coach-token'));
  assert.ok(seen.some(x => x.body.action === 'review' && x.authorization === 'Bearer fixture-coach-token'));
  console.log('PASS: Chromium recovery UI interaction contract.');
} finally { await browser.close(); }

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const auth = fs.readFileSync('auth-preview/connected-auth.js', 'utf8');

function scriptById(id) {
  const marker = '<script id="' + id + '">';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, 'missing script: ' + id);
  const bodyStart = html.indexOf('>', start) + 1;
  const end = html.indexOf('</script>', bodyStart);
  assert.ok(end > bodyStart, 'unclosed script: ' + id);
  return html.slice(bodyStart, end);
}

test('recovery UI script parses and uses the pre-auth endpoint', () => {
  const script = scriptById('seh-password-recovery-ui-20261017');
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /trainee-password-recovery-preauth/);
  assert.match(script, /trainee-password-recovery/);
});

test('recovery is four-digit, no-SMS and browser-claim bound', () => {
  const script = scriptById('seh-password-recovery-ui-20261017');
  assert.match(script, /maxlength="4"/);
  assert.match(script, /sessionStorage/);
  assert.match(script, /crypto\.getRandomValues/);
  assert.match(script, /بدون پیامک/);
  assert.match(script, /sehRecoveryFetchCodeBtn/);
  assert.doesNotMatch(script, /recovery_code|sehRecoveryIssuedCode/);
});

test('coach review never receives or renders a recovery code', () => {
  const script = scriptById('seh-password-recovery-ui-20261017');
  assert.doesNotMatch(script, /data\.recovery_code|sehRecoveryIssuedCode/);
  assert.match(script, /decision\s*===\s*['"]approve['"]/);
});

test('recovery panel is mounted into the dedicated recovery view', () => {
  assert.match(auth, /sehRecoveryMount/);
  assert.match(auth, /sehAuthNavigate/);
  assert.match(auth, /data-seh-view=recovery/);
  assert.match(auth, /moveRecovery/);
});

test('trainee phone-alias login fix remains present and parses', () => {
  assert.ok(html.includes('SEH_TRAINEE_ALIAS_LOGIN_ROOT_FIX_20261126'));
  const start = html.indexOf('<script id="SEH_TRAINEE_ALIAS_LOGIN_ROOT_FIX_20261126">');
  const bodyStart = html.indexOf('>', start) + 1;
  const end = html.indexOf('</script>', bodyStart);
  assert.ok(end > bodyStart);
  const script = html.slice(bodyStart, end);
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes("'trainee.'+hash"));
  assert.match(script, /signInWithPassword/);
  assert.match(script, /getSession/);
});

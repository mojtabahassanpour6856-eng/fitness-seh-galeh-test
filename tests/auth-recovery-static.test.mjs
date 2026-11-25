import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const authPath = 'auth-preview/connected-auth.js';
const auth = readFileSync(authPath, 'utf8');

test('main app loads the connected auth implementation', () => {
  assert.match(html, /<script[^>]+src=["']\.\/auth-preview\/connected-auth\.js\?v=4["']/);
});

test('main app contains the auth host elements required by the initializer', () => {
  for (const id of ['authScreen', 'authTabs', 'coachLoginBox', 'traineeLoginBox', 'authError']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
});

test('connected auth JavaScript parses', () => {
  assert.doesNotThrow(() => new Function(auth));
});

test('connected auth marks itself ready only after mounting all auth views', () => {
  assert.match(auth, /window\.__sehAuthRedesignConnecting=true/);
  assert.match(auth, /window\.__sehAuthRedesignConnected=true;\s*window\.__sehAuthRedesignConnecting=false;\s*\}\)\(\);/);
  assert.doesNotMatch(auth, /window\.__sehAuthRedesignConnected=true;\s*const st=/);
});

test('coach and trainee image paths exist and match their intended roles', () => {
  assert.ok(auth.includes('./assets/auth/coach-entry.png'));
  assert.ok(auth.includes('./assets/auth/trainee-entry.png'));
  assert.ok(existsSync('assets/auth/coach-entry.png'));
  assert.ok(existsSync('assets/auth/trainee-entry.png'));
});

test('image assets are valid PNG files with non-zero dimensions', () => {
  for (const path of ['assets/auth/coach-entry.png', 'assets/auth/trainee-entry.png']) {
    const png = readFileSync(path);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} is not a PNG`);
    assert.ok(png.readUInt32BE(16) > 0, `${path} has zero width`);
    assert.ok(png.readUInt32BE(20) > 0, `${path} has zero height`);
  }
});

test('the redesigned home screen is defined exactly once', () => {
  const matches = auth.match(/id="sehAuthHome"/g) || [];
  assert.equal(matches.length, 1, 'duplicate home-screen IDs can cause the wrong screen to render');
});

test('auth scroll overrides allow document and locked body scrolling', () => {
  assert.match(auth, /html:has\(#authScreen:not\(\[style\*="display: none"\]\)\)\{[^}]*overflow-y:auto!important/);
  assert.match(auth, /body\.locked\{[^}]*overflow-y:auto!important/);
  assert.doesNotMatch(auth, /overflow-y:hidden!important/);
});

test('trainee password recovery UI logic remains present', () => {
  assert.ok(auth.includes('sehRecoveryStudentPanel'));
  assert.ok(auth.includes('moveRecovery'));
});

test('auth fallback skips when the redesigned initializer mounted successfully', () => {
  const fallbackStart = html.indexOf('<!-- AUTH SCREEN FALLBACK');
  const fallbackEnd = html.indexOf('<!-- FINAL COMPLETION LAYER', fallbackStart);
  assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart);
  const fallback = html.slice(fallbackStart, fallbackEnd);
  assert.ok(fallback.includes('if(!root||window.__sehAuthRedesignConnected)return;'));
  assert.doesNotMatch(fallback, /card\\.innerHTML\\s*=/);
});

test('auth fallback waits until the connected redesign initializer has had a chance to mount', () => {
  const fallbackStart = html.indexOf('<!-- AUTH SCREEN FALLBACK');
  const fallbackEnd = html.indexOf('<!-- FINAL COMPLETION LAYER', fallbackStart);
  const connectedScript = html.lastIndexOf('<script src="./auth-preview/connected-auth.js?v=4"');
  assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart);
  assert.ok(connectedScript > fallbackEnd, 'connected auth script is expected after the fallback block');
  const fallback = html.slice(fallbackStart, fallbackEnd);
  assert.ok(fallback.includes('setTimeout(function(){'), 'fallback must defer its DOM check until parsing and later scripts complete');
  assert.ok(fallback.includes('},0);'), 'fallback must run as a zero-delay deferred callback');
});


test('auth fallback waits for window load and never destroys the original registration form', () => {
  const fallbackStart = html.indexOf('<!-- AUTH SCREEN FALLBACK');
  const fallbackEnd = html.indexOf('<!-- FINAL COMPLETION LAYER', fallbackStart);
  assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart);
  const fallback = html.slice(fallbackStart, fallbackEnd);
  assert.match(fallback, /window\.addEventListener\('load'/);
  assert.match(fallback, /window\.__sehAuthRedesignConnected/);
  assert.doesNotMatch(fallback, /card\.innerHTML\s*=/);
  assert.doesNotMatch(fallback, /card\.replaceChildren\s*\(/);
  for (const id of ['traineeRegName', 'traineeRegPhone', 'traineeRegSessions', 'traineeRegDays', 'traineeRegTime', 'traineeRegPassword', 'traineeRegPasswordConfirm']) {
    assert.ok(html.includes(`id="${id}"`), `original registration field #${id} must remain in the document`);
  }
});

test('missing optional profile helper cannot abort main app startup or client navigation', () => {
  assert.match(html, /if\(typeof window\.addProfileBasicFields==='function'\)window\.addProfileBasicFields\(\);/);
  assert.doesNotMatch(html, /(?<![\\w.$])addProfileBasicFields\(\);/);
  assert.match(html, /currentClient&&typeof window\.loadProfileBasic==='function'/);
});

test('registration and login blocks are located by stable field IDs, not heading text', () => {
  assert.match(auth, /trainee\.querySelector\('#traineeRegName'\)\?\.closest\('\.trainee-auth-block'\)/);
  assert.match(auth, /trainee\.querySelector\('#traineePhoneLogin'\)\?\.closest\('\.trainee-auth-block'\)/);
  assert.match(auth, /if\(registrationBlock\)registrationBlock\.classList\.add\('seh-reg-block'\)/);
});

test('moved trainee registration form stays visible in the redesigned registration view', () => {
  assert.match(auth, /#sehRegisterMount>\.seh-reg-block\{display:block!important/);
  assert.match(auth, /registration\.style\.setProperty\('display','block','important'\)/);
  for (const id of ['traineeRegName', 'traineeRegPhone', 'traineeRegSessions', 'traineeRegDays', 'traineeRegTime']) {
    assert.ok(html.includes(`id="${id}"`), `missing registration field #${id}`);
  }
});

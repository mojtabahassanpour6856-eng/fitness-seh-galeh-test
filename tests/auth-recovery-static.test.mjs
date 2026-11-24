import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const authPath = 'auth-preview/connected-auth.js';
const auth = readFileSync(authPath, 'utf8');

test('main app loads the connected auth implementation', () => {
  assert.match(html, /<script[^>]+src=["']\.\/auth-preview\/connected-auth\.js\?v=3["']/);
});

test('main app contains the auth host elements required by the initializer', () => {
  for (const id of ['authScreen', 'authTabs', 'coachLoginBox', 'traineeLoginBox', 'authError']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
});

test('connected auth JavaScript parses', () => {
  assert.doesNotThrow(() => new Function(auth));
});

test('coach and trainee image paths exist and match their intended roles', () => {
  assert.ok(auth.includes('./assets/auth/coach-entry.png'));
  assert.ok(auth.includes('./assets/auth/trainee-entry.png'));
  assert.ok(existsSync('assets/auth/coach-entry.png'));
  assert.ok(existsSync('assets/auth/trainee-entry.png'));
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

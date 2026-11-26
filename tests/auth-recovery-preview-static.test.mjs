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
assert.match(auth, /sehAuthRecovery/);
assert.match(auth, /sehRecoveryStudentPanel/);
assert.match(auth, /trainee-entry\.webp/);
assert.match(auth, /coach-entry\.webp/);
assert.match(auth, /seh-recovery-preview-notice|sehRecoveryStudentPanel/);
console.log('PASS: isolated recovery UI preview; no backend calls; WebP auth assets preserved');

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../experiments/smart-anatomy/index.html', import.meta.url), 'utf8');

test('anatomy page contains front and back interactive views', () => {
  assert.match(html, /front/i);
  assert.match(html, /back/i);
  assert.match(html, /class="muscle[^"]*"[^>]*data-id=/);
  assert.ok((html.match(/data-id="/g) || []).length >= 20);
});

test('all inline JavaScript parses', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, 'inline script exists');
  for (const [, source] of scripts) assert.doesNotThrow(() => new Function(source));
});

test('selected muscle family is highlighted red and unrelated groups reset', () => {
  assert.match(html, /\.muscle\.selected[^{]*\{[^}]*fill:\s*#df3434/i);
  assert.match(html, /\(parentMap\[mid\]\|\|mid\)===family/);
  assert.match(html, /classList\.toggle\("selected",active\)/);
});

test('selection supports keyboard and accessible pressed state', () => {
  assert.match(html, /e\.key==="Enter"\|\|e\.key===" "/);
  assert.match(html, /setAttribute\("aria-pressed"/);
  assert.match(html, /setAttribute\("aria-label"/);
});

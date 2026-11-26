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

test('photo anatomy supports primary, secondary, and tertiary activation levels', () => {
  assert.match(html, /\.hotspot\.level-primary path\s*\{[^}]*fill:#e53935/i);
  assert.match(html, /\.hotspot\.level-secondary path\s*\{[^}]*fill:#ed7772/i);
  assert.match(html, /\.hotspot\.level-tertiary path\s*\{[^}]*fill:#f4b8b4/i);
  assert.match(html, /applyPhotoMuscleLevels\(\)/);
  assert.match(html, /\(parentMap\[mid\]\|\|mid\)===family/);
  assert.match(html, /classList\.toggle\("selected",active\)/);
});

test('photo assets are local and both body views can be selected', () => {
  assert.doesNotMatch(html, /raw\.githubusercontent\.com/);
  assert.match(html, /\.\/images\/images\/IMG_/);
  assert.match(html, /data-view="back"(?![^>]*disabled)/);
});

test('selected exercise maps its own primary and secondary muscles', () => {
  assert.match(html, /function exerciseActivationMap\(exercise\)/);
  assert.match(html, /labelMatchesGroup\(primaryLabel,g\.id\)/);
  assert.match(html, /labelMatchesGroup\(secondaryLabel,g\.id\)/);
  assert.match(html, /muscleBucket:bucket/);
  assert.match(html, /selectedExercise=e/);
  assert.match(html, /applyPhotoMuscleLevels\(\)/);
  assert.match(html, /selectedExercise=null/);
});

test('selection supports keyboard and accessible pressed state', () => {
  assert.match(html, /e\.key==="Enter"\|\|e\.key===" "/);
  assert.match(html, /setAttribute\("aria-pressed"/);
  assert.match(html, /setAttribute\("aria-label"/);
});

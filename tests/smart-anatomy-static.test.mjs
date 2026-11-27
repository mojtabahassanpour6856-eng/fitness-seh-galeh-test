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

test('movement-specific activation rules cover major gym movement families', () => {
  assert.match(html, /movementActivationRules/);
  assert.match(html, /پرس سینه/);
  assert.match(html, /پرس بالاسینه/);
  assert.match(html, /نشر جانب/);
  assert.match(html, /اسکوات/);
  assert.match(html, /ددلیفت رومانیایی/);
  assert.match(html, /لت سیم کش/);
  assert.match(html, /exerciseActivationMap/);
  assert.match(html, /applyMovementRule\(exercise,curated\)/);
});

test('specific movement rules distinguish presses from fly isolation', () => {
  assert.match(html, /فلای سیم کش از پایین.*primary:\["upper-chest"\],secondary:\["front-delts"\]/);
  assert.match(html, /قفسه دمبل.*primary:\["mid-chest"\],secondary:\["front-delts"\]/);
  assert.match(html, /پرس سینه\|شنا سوئدی.*triceps-long.*triceps-lateral/);
});

test('specific movement rules cover lower body, back, and forearm movements', () => {
  assert.match(html, /اسکوات.*primary:\["quads","glute-max"\]/);
  assert.match(html, /ددلیفت رومانیایی.*primary:\["hamstrings","glute-max"\]/);
  assert.match(html, /لت سیم کش\|بارفیکس.*primary:\["lats"\]/);
  assert.match(html, /مچ دمبل\.\*کف دست بالا.*primary:\["forearm-flexors"\]/);
  assert.match(html, /مچ دمبل\.\*کف دست پایین.*primary:\["forearm-extensors"\]/);
});
test('covered glute muscles are not painted onto the shorts in the reference image', () => {
  assert.match(html, /occludedByClothing=new Set\(\["glute-max","glute-med"\]\)/);
  assert.match(html, /photoMuscles\.has\(g\.id\)&&!occludedByClothing\.has\(g\.id\)/);
  assert.match(html, /برای جلوگیری از نمایش نادرست، روی تصویر رنگی نشده‌اند/);
});

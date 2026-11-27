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
  assert.match(html, /\.hotspot\.level-secondary path\s*\{[^}]*fill:#e85d58/i);
  assert.match(html, /\.hotspot\.level-tertiary path\s*\{[^}]*fill:#f2a6a2/i);
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
test('front chest and abdominal hotspots are aligned to the visible anatomy', () => {
  const group = id => {
    const start = html.indexOf(`<g class="hotspot" data-muscle="${id}"`);
    assert.notEqual(start, -1, `missing hotspot: ${id}`);
    return html.slice(start, html.indexOf('</g>', start));
  };
  assert.match(group('upper-chest'), /M220 255/);
  assert.match(group('mid-chest'), /M207 245/);
  assert.match(group('lower-chest'), /M225 285/);
  assert.match(group('upper-abs'), /M294 310/);
  assert.match(group('lower-abs'), /M294 388/);
  assert.match(group('obliques'), /M245 315/);
});

test('posterior thigh and calf hotspots follow the visible leg anatomy', () => {
  const hamstrings = html.slice(html.indexOf('data-muscle="hamstrings"'), html.indexOf('</g>', html.indexOf('data-muscle="hamstrings"')));
  const calves = html.slice(html.indexOf('data-muscle="calves"'), html.indexOf('</g>', html.indexOf('data-muscle="calves"')));
  assert.match(hamstrings, /M270 570/);
  assert.match(calves, /M275 735/);
});

test('shoulder hotspots stay within the visible deltoid caps on front and back views', () => {
  const group = id => {
    const start = html.indexOf(`<g class="hotspot" data-muscle="${id}"`);
    assert.notEqual(start, -1, `missing hotspot: ${id}`);
    return html.slice(start, html.indexOf('</g>', start));
  };
  assert.match(group('front-delts'), /M207 157/);
  assert.match(group('front-delts'), /Q222 139 244 151/);
  assert.doesNotMatch(group('front-delts'), /M222 205/);
  assert.match(group('side-delts'), /M198 225/);
  assert.match(group('rear-delts'), /M203 235/);
  assert.doesNotMatch(group('rear-delts'), /335/);
});

test('lower-back hotspot ends above the shorts waistband', () => {
  const start = html.indexOf('<g class="hotspot" data-muscle="lower-back"');
  const group = html.slice(start, html.indexOf('</g>', start));
  assert.match(group, /M320 425/);
  assert.match(group, /L360 492/);
  assert.doesNotMatch(group, /550|570/);
});

test('posterior trapezius is limited to the upper central back', () => {
  const start = html.indexOf('<g class="hotspot" data-muscle="traps"');
  const group = html.slice(start, html.indexOf('</g>', start));
  assert.match(group, /M280 195/);
  assert.match(group, /Q370 285 342 320/);
  assert.doesNotMatch(group, /440 300/);
});

test('mid-back covers the rhomboid region while lats remain lateral', () => {
  const get = id => {
    const start = html.indexOf(`<g class="hotspot" data-muscle="${id}"`);
    return html.slice(start, html.indexOf('</g>', start));
  };
  assert.match(get('mid-back'), /M285 270/);
  assert.match(get('mid-back'), /L388 365/);
  assert.match(get('lats'), /M265 315/);
  assert.match(get('lats'), /M418 315/);
});

test('front arm muscle regions are separated and remain on the upper arm', () => {
  const get = id => {
    const start = html.indexOf(`<g class="hotspot" data-muscle="${id}"`);
    return html.slice(start, html.indexOf('</g>', start));
  };
  assert.match(get('biceps-long'), /M177 292/);
  assert.match(get('biceps-short'), /M207 322/);
  assert.match(get('brachialis'), /M170 386/);
  assert.doesNotMatch(get('biceps-long'), /536 350/);
});

test('posterior triceps heads are distinct and forearm flexors/extensors use different paths', () => {
  const get = id => {
    const start = html.indexOf(`<g class="hotspot" data-muscle="${id}"`);
    return html.slice(start, html.indexOf('</g>', start));
  };
  assert.match(get('triceps-long'), /M185 300/);
  assert.match(get('triceps-lateral'), /M218 305/);
  assert.match(get('forearm-flexors'), /M164 438/);
  assert.match(get('forearm-extensors'), /M194 442/);
  assert.notEqual(get('forearm-flexors'), get('forearm-extensors'));
});

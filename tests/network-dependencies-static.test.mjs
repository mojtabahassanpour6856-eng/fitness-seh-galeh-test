import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const localSdk = './vendor/supabase-2.119.0.js';

test('critical Supabase SDK is loaded from the same GitHub Pages origin', () => {
  assert.ok(html.includes('<script id="seh-supabase-sdk" src="' + localSdk + '"></script>'));
  assert.ok(fs.existsSync('vendor/supabase-2.119.0.js'), 'local SDK file must exist');
  assert.doesNotMatch(html, /(?:cdn\.jsdelivr\.net|unpkg\.com)\/npm\/@supabase\/supabase-js/i);
});

test('Supabase preload also points to the local SDK', () => {
  assert.ok(html.includes('<link rel="preload" as="script" href="' + localSdk + '">'));
  assert.doesNotMatch(html, /<link[^>]+href=["']https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)\/npm\/@supabase\/supabase-js/i);
});

test('no external Supabase SDK package reference remains in the main page', () => {
  assert.doesNotMatch(html, /@supabase\/supabase-js/i);
});

test('remaining external script dependencies are visible for future review', () => {
  const externalScripts = [...html.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/gi)].map(match => match[1]);
  const uniqueHosts = [...new Set(externalScripts.map(value => new URL(value).hostname))].sort();
  console.log('External script hosts requiring review:', uniqueHosts.length ? uniqueHosts.join(', ') : '(none)');
  assert.ok(Array.isArray(uniqueHosts));
});

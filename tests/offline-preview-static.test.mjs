import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('offline-preview/index.html','utf8');
const sw=fs.readFileSync('offline-preview/sw.js','utf8');
const manifest=JSON.parse(fs.readFileSync('offline-preview/manifest.webmanifest','utf8'));

test('preview is isolated from Supabase and real user data',()=>{
 assert.doesNotMatch(html,/supabase\.co|service_role|trainee_payment_receipts/i);
 assert.match(html,/بدون اتصال به Supabase/);
 assert.match(html,/seh\.offline-safe-shell\.v1/);
});
test('offline UI hides demo private content without a valid marker',()=>{
 assert.match(html,/body\.limited #authDemo/);
 assert.match(html,/body\.limited \.private-nav/);
 assert.match(html,/version===1&&x\.view==='home'/);
});
test('online verification endpoint is never cached',()=>{
 assert.match(sw,/health\.txt/);
 assert.match(sw,/if\(url\.pathname\.endsWith\('\/health\.txt'\)\)return/);
});
test('service worker caches only the preview shell assets',()=>{
 assert.match(sw,/const ASSETS=\['\.\/','\.\/index\.html','\.\/manifest\.webmanifest','\.\/icon\.svg'\]/);
 assert.doesNotMatch(sw,/POST|background.?sync/i);
});
test('inline JavaScript and service worker parse cleanly',()=>{
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1]));
 assert.doesNotThrow(()=>new Function(sw));
});
test('PWA scope is isolated to this preview folder',()=>{
 assert.equal(manifest.scope,'./');
 assert.equal(manifest.start_url,'./');
 assert.equal(manifest.display,'standalone');
});

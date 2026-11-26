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


const rootHtml=fs.readFileSync('index.html','utf8');
const rootSw=fs.readFileSync('sw.js','utf8');
const rootManifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));

test('root test PWA identity, start URL and scope stay inside the test Pages path',()=>{
 assert.equal(rootManifest.id,'/fitness-seh-galeh-test/');
 assert.equal(rootManifest.start_url,'/fitness-seh-galeh-test/?appicon=gold20261018');
 assert.equal(rootManifest.scope,'/fitness-seh-galeh-test/');
 assert.ok(rootHtml.includes('<link rel="manifest" href="./manifest.json">'));
 assert.ok(rootHtml.includes("navigator.serviceWorker.register('./sw.js',{scope:'./'})"));
 assert.equal(rootHtml.includes('<base '),false);
});

test('root PWA manifest references an existing install icon',()=>{
 assert.equal(rootManifest.icons.length,1);
 assert.equal(rootManifest.icons[0].src,'icon.svg');
 assert.equal(rootManifest.icons[0].type,'image/svg+xml');
 assert.ok(fs.existsSync(rootManifest.icons[0].src));
 assert.ok(fs.readFileSync(rootManifest.icons[0].src,'utf8').includes('<svg'));
});

test('root service worker remains notification-only and does not cache app data',()=>{
 assert.ok(rootSw.includes("addEventListener('push'"));
 assert.ok(rootSw.includes("addEventListener('notificationclick'"));
 assert.equal(/addEventListener\(['"]fetch['"]|caches\.|cache\.put/i.test(rootSw),false);
});

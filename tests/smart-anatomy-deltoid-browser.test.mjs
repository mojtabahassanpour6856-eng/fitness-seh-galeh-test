import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('experiments/smart-anatomy-v2-chest-deltoid');
const mime = { '.html':'text/html; charset=utf-8', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml' };
let server, browser;

test('dedicated chest-deltoid preview loads, renders all eight SVG regions and responds to movement/selection', async t => {
  server = createServer(async (req,res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(root, '.' + pathname);
      if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless:true });
  const page = await browser.newPage({ viewport:{ width:390, height:844 }, deviceScaleFactor:1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/index.html', { waitUntil:'networkidle' });

  const initial = await page.evaluate(() => ({
    svgCount: document.querySelectorAll('svg').length,
    regions: [...document.querySelectorAll('svg .muscle[data-muscle]')].map(el => el.dataset.muscle),
    rolesReady: Boolean(document.querySelector('#roles')?.textContent.trim()),
    title: document.querySelector('h1')?.textContent.trim()
  }));
  assert.equal(initial.svgCount, 1, 'dedicated preview should expose its inline SVG directly');
  assert.equal(initial.regions.length, 8, 'all eight left/right chest and deltoid regions must render');
  assert.equal(new Set(initial.regions).size, 8, 'muscle region identifiers must be unique');
  assert.ok(initial.rolesReady, 'movement roles should be populated on initial render');
  assert.match(initial.title, /نمای جلو/);

  await page.locator('[data-muscle="front-deltoid-left"]').click();
  assert.equal(await page.locator('[data-muscle="front-deltoid-left"]').evaluate(el => el.classList.contains('selected')), true);
  assert.equal(await page.locator('[data-muscle="front-deltoid-right"]').evaluate(el => el.classList.contains('selected')), false);

  await page.locator('.exercise[data-ex="lateral"]').click();
  const lateral = await page.evaluate(() => ({
    primary: [...document.querySelectorAll('.muscle.primary')].map(el => el.dataset.muscle),
    activeButton: document.querySelector('.exercise.active')?.dataset.ex,
    roles: document.querySelector('#roles')?.innerText || ''
  }));
  assert.deepEqual(lateral.primary.sort(), ['side-deltoid-left','side-deltoid-right'].sort());
  assert.equal(lateral.activeButton, 'lateral');
  assert.match(lateral.roles, /سرشانه میانی/);
  await page.screenshot({ path:'artifacts/deltoid-dedicated-preview.png', fullPage:true });

  await page.locator('.exercise[data-ex="incline"]').click();
  const incline = await page.evaluate(() => [...document.querySelectorAll('.muscle.primary')].map(el => el.dataset.muscle).sort());
  assert.deepEqual(incline, ['upper-pec-left','upper-pec-right'].sort());
  assert.deepEqual(pageErrors, [], 'no uncaught JavaScript errors should occur');
  t.diagnostic(JSON.stringify({ ...initial, lateral, pageErrors }));
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

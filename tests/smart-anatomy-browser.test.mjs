import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('experiments/smart-anatomy');
const mime = { '.html':'text/html; charset=utf-8', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.css':'text/css', '.js':'text/javascript' };
let server, browser, page, origin;
test('browser renders both anatomy photos and interactive SVG hotspots', async t => {
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
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless:true });
  page = await browser.newPage({ viewport:{ width:390, height:844 }, deviceScaleFactor:1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/index.html', { waitUntil:'networkidle' });
  await page.waitForFunction(() => {
    const img = document.querySelector('#anatomyPhoto');
    return img?.complete && img.naturalWidth > 0;
  });
  const front = await page.evaluate(() => {
    const img = document.querySelector('#anatomyPhoto');
    const svg = document.querySelector('#muscleHotspots');
    const a=img.getBoundingClientRect(), b=svg.getBoundingClientRect();
    return { naturalWidth:img.naturalWidth, naturalHeight:img.naturalHeight,
      photo:{x:a.x,y:a.y,width:a.width,height:a.height},
      overlay:{x:b.x,y:b.y,width:b.width,height:b.height},
      visible:[...svg.querySelectorAll('.hotspot')].filter(x=>getComputedStyle(x).display!=='none').length,
      primary:svg.querySelectorAll('.hotspot.level-primary').length };
  });
  assert.equal(front.naturalWidth,683);
  assert.equal(front.naturalHeight,1024);
  assert.ok(front.visible >= 10, 'front view should expose its mapped muscles');
  assert.ok(Math.abs(front.photo.x-front.overlay.x)<1 && Math.abs(front.photo.y-front.overlay.y)<1 &&
    Math.abs(front.photo.width-front.overlay.width)<1 && Math.abs(front.photo.height-front.overlay.height)<1,
    'SVG overlay must align with the rendered reference photo');
  await page.locator('#muscleHotspots [data-muscle="mid-chest"]').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true })));
  await page.waitForFunction(() => document.querySelector('#muscleHotspots [data-muscle="mid-chest"]')?.classList.contains('selected'));
  await page.screenshot({ path:'artifacts/anatomy-front.png', fullPage:true });
  await page.locator('.tab[data-view="back"]').click();
  await page.waitForFunction(() => decodeURIComponent(document.querySelector('#anatomyPhoto')?.src || '').includes('IMG_۲۰۲۶۱۱۱۹_۲۰۳۱۲۹.jpg') &&
    document.querySelector('#anatomyPhoto')?.complete && document.querySelector('#anatomyPhoto')?.naturalWidth > 0);
  const back = await page.evaluate(() => ({
    naturalWidth:document.querySelector('#anatomyPhoto').naturalWidth,
    visible:[...document.querySelectorAll('#muscleHotspots .hotspot')].filter(x=>getComputedStyle(x).display!=='none').length,
    tricepsVisible:getComputedStyle(document.querySelector('[data-muscle="triceps-long"]')).display!=='none'
  }));
  assert.equal(back.naturalWidth,683);
  assert.ok(back.visible >= 8, 'back view should expose its mapped muscles');
  assert.equal(back.tricepsVisible,true);
  await page.locator('#muscleHotspots [data-muscle="triceps-long"]').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true })));
  await page.waitForFunction(() => document.querySelector('#muscleHotspots [data-muscle="triceps-long"]')?.classList.contains('selected'));
  await page.screenshot({ path:'artifacts/anatomy-back.png', fullPage:true });
  assert.deepEqual(errors, [], 'no uncaught browser JavaScript errors');
  t.diagnostic(JSON.stringify({ front, back, browserErrors:errors }));
});
test.after(async () => { if(browser) await browser.close(); if(server) await new Promise(resolve=>server.close(resolve)); });

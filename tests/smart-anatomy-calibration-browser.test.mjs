import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('experiments/smart-anatomy');
const mime = { '.html':'text/html; charset=utf-8', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml' };
let server, browser;

test('calibration controls transform the SVG overlay and preserve centered photo alignment in both views', async t => {
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
  const page = await browser.newPage({ viewport:{ width:1280, height:900 }, deviceScaleFactor:1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/calibration.html', { waitUntil:'networkidle' });
  await page.waitForFunction(() => {
    const img = document.querySelector('#photo');
    return img?.complete && img.naturalWidth > 0;
  });

  const front = await page.evaluate(() => ({
    naturalWidth:document.querySelector('#photo').naturalWidth,
    naturalHeight:document.querySelector('#photo').naturalHeight,
    transform:getComputedStyle(document.querySelector('#calibrationOverlay')).transform
  }));
  assert.equal(front.naturalWidth,683,'front reference photo should load at its native width');
  assert.equal(front.naturalHeight,1024,'front reference photo should load at its native height');

  await page.locator('#x').fill('24');
  await page.locator('#y').fill('-16');
  await page.locator('#s').fill('110');
  const transformed = await page.locator('#calibrationOverlay').evaluate(el => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { a:m.a, d:m.d, e:m.e, f:m.f };
  });
  assert.ok(Math.abs(transformed.a-1.1)<0.001 && Math.abs(transformed.d-1.1)<0.001,
    'scale slider must change the SVG overlay scale');
  assert.ok(Math.abs(transformed.e-24)<0.01 && Math.abs(transformed.f+16)<0.01,
    'horizontal and vertical sliders must translate the SVG overlay');

  await page.locator('#backView').click();
  await page.waitForFunction(() => {
    const img = document.querySelector('#photo');
    return img?.complete && img.naturalWidth === 780;
  });
  const back = await page.evaluate(() => {
    const img=document.querySelector('#photo'),svg=document.querySelector('#calibrationOverlay');
    const a=img.getBoundingClientRect(),b=svg.getBoundingClientRect();
    return { naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
      photoCenter:{x:a.x+a.width/2,y:a.y+a.height/2},
      overlayCenter:{x:b.x+b.width/2,y:b.y+b.height/2},
      transform:getComputedStyle(svg).transform };
  });
  assert.equal(back.naturalWidth,780,'back reference photo should load at its native width');
  assert.equal(back.naturalHeight,1024,'back reference photo should load at its native height');
  assert.ok(Math.abs(back.photoCenter.x-back.overlayCenter.x)<1 &&
    Math.abs(back.photoCenter.y-back.overlayCenter.y)<1,
    'back SVG overlay and photo should remain centered in the calibration stage');

  await page.locator('#reset').click();
  const reset = await page.locator('#calibrationOverlay').evaluate(el => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { a:m.a,d:m.d,e:m.e,f:m.f };
  });
  assert.ok(Math.abs(reset.a-1)<0.001 && Math.abs(reset.d-1)<0.001 &&
    Math.abs(reset.e)<0.01 && Math.abs(reset.f)<0.01,
    'reset should restore the SVG overlay transform');
  assert.deepEqual(errors,[],'calibration page should not produce uncaught JavaScript errors');
  t.diagnostic(JSON.stringify({front,transformed,back,reset,errors}));
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

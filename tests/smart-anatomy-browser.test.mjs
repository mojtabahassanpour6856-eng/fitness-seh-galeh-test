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
  const isolatedSelection = await page.evaluate(() => [...document.querySelectorAll('#muscleHotspots .hotspot.level-selected')].map(el=>el.dataset.muscle));
  assert.deepEqual(isolatedSelection, ['mid-chest'], 'manual tap should highlight only the tapped muscle group');
  const roleChecks = await page.evaluate(() => {
    const samples = {
      press: ['پرس سینه هالتر','هالتر','سینه',''],
      fly: ['قفسه دمبل','دمبل','سینه',''],
      squat: ['اسکوات هالتر','هالتر','پا',''],
      romanianDeadlift: ['ددلیفت رومانیایی','هالتر','پشت پا',''],
      pulldown: ['لت سیم کش از جلو','سیم کش','زیر بغل',''],
      lateralRaise: ['نشر جانب دمبل','دمبل','سرشانه',''],
      hammerCurl: ['جلو بازو چکشی دمبل','دمبل','جلو بازو','']
    };
    const pack = r => ({primary:[...r.primary],secondary:[...r.secondary],tertiary:[...r.tertiary]});
    return Object.fromEntries(Object.entries(samples).map(([key,exercise])=>[key,pack(exerciseActivationMap(exercise))]));
  });
  assert.ok(roleChecks.press.primary.includes('mid-chest'), 'bench press should prioritize mid chest');
  assert.ok(roleChecks.press.secondary.includes('triceps-long') && roleChecks.press.secondary.includes('triceps-lateral'),
    'bench press should classify triceps as assisting muscles');
  assert.ok(roleChecks.fly.primary.includes('mid-chest') && !roleChecks.fly.secondary.includes('triceps-long') &&
    !roleChecks.fly.secondary.includes('triceps-lateral'), 'dumbbell fly should not incorrectly classify triceps as secondary');
  assert.ok(roleChecks.squat.primary.includes('quads') && roleChecks.squat.primary.includes('glute-max'),
    'squat should prioritize quadriceps and gluteus maximus');
  assert.ok(roleChecks.romanianDeadlift.primary.includes('hamstrings') && roleChecks.romanianDeadlift.primary.includes('glute-max'),
    'Romanian deadlift should prioritize hamstrings and gluteus maximus');
  assert.ok(roleChecks.pulldown.primary.includes('lats') && roleChecks.pulldown.secondary.includes('biceps-long'),
    'lat pulldown should prioritize lats with biceps assisting');
  assert.ok(roleChecks.lateralRaise.primary.includes('side-delts'),
    'lateral raise should prioritize side deltoids');
  assert.ok(roleChecks.hammerCurl.primary.includes('brachialis'),
    'hammer curl should prioritize brachialis');
  for (const roles of [roleChecks.press,roleChecks.fly]) {
    const sets = [new Set(roles.primary),new Set(roles.secondary),new Set(roles.tertiary)];
    assert.equal(sets[0].size,roles.primary.length);
    assert.equal(sets[1].size,roles.secondary.length);
    assert.equal(sets[2].size,roles.tertiary.length);
    assert.ok(!roles.primary.some(id=>sets[1].has(id)||sets[2].has(id)), 'a muscle cannot occupy multiple activation levels');
    assert.ok(!roles.secondary.some(id=>sets[2].has(id)), 'secondary and tertiary roles must not overlap');
  }

  await page.locator('#exerciseList [data-ex="0"]').click();
  const renderedExerciseRoles = await page.evaluate(() => ({
    name: selectedExercise?.[0] || null,
    primary: [...document.querySelectorAll('#muscleHotspots .hotspot.level-primary')].map(el=>el.dataset.muscle),
    secondary: [...document.querySelectorAll('#muscleHotspots .hotspot.level-secondary')].map(el=>el.dataset.muscle),
    tertiary: [...document.querySelectorAll('#muscleHotspots .hotspot.level-tertiary')].map(el=>el.dataset.muscle)
  }));
  assert.ok(renderedExerciseRoles.name, 'choosing a movement should set the active exercise');
  assert.equal(renderedExerciseRoles.name, 'پرس سینه دمبل', 'the first chest movement in the rendered bank should be the expected dumbbell press');
  assert.ok(renderedExerciseRoles.primary.includes('mid-chest'), 'bench press should paint mid chest as primary');
  assert.ok(renderedExerciseRoles.secondary.includes('front-delts'), 'bench press should paint front delts as secondary');
  assert.ok(renderedExerciseRoles.secondary.includes('triceps-long') && renderedExerciseRoles.secondary.includes('triceps-lateral'),
    'bench press should paint both visible triceps heads as secondary');
  assert.ok(renderedExerciseRoles.tertiary.includes('side-delts'), 'bench press should paint side delts as tertiary');
  assert.ok(!renderedExerciseRoles.primary.some(id=>renderedExerciseRoles.secondary.includes(id) ||
    renderedExerciseRoles.tertiary.includes(id)), 'rendered muscle levels must not conflict');
  await page.screenshot({ path:'artifacts/anatomy-front-exercise.png', fullPage:true });

  await page.locator('.tab[data-view="back"]').click();
  await page.waitForFunction(() => decodeURIComponent(document.querySelector('#anatomyPhoto')?.src || '').includes('IMG_۲۰۲۶۱۱۱۹_۲۰۳۱۲۹.jpg') &&
    document.querySelector('#anatomyPhoto')?.complete && document.querySelector('#anatomyPhoto')?.naturalWidth > 0);
  const back = await page.evaluate(() => {
    const img=document.querySelector('#anatomyPhoto'),svg=document.querySelector('#muscleHotspots');
    const a=img.getBoundingClientRect(),b=svg.getBoundingClientRect();
    return { naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
      photo:{x:a.x,y:a.y,width:a.width,height:a.height},
      overlay:{x:b.x,y:b.y,width:b.width,height:b.height},
      visible:[...svg.querySelectorAll('.hotspot')].filter(x=>getComputedStyle(x).display!=='none').length,
      tricepsVisible:getComputedStyle(document.querySelector('[data-muscle="triceps-long"]')).display!=='none',
      viewBoxRatio:(()=>{const v=(svg.getAttribute('viewBox')||'0 0 683 1024').trim().split(/[ ,]+/).map(Number);return v[2]/v[3];})() };
  });
  assert.ok(back.naturalWidth>0 && back.naturalHeight>0, 'back reference image must load');
  assert.ok(back.visible >= 8, 'back view should expose its mapped muscles');
  assert.equal(back.tricepsVisible,true);
  const photoCenter={x:back.photo.x+back.photo.width/2,y:back.photo.y+back.photo.height/2};
  const overlayCenter={x:back.overlay.x+back.overlay.width/2,y:back.overlay.y+back.overlay.height/2};
  assert.ok(Math.abs(photoCenter.x-overlayCenter.x)<1 && Math.abs(photoCenter.y-overlayCenter.y)<1,
    'back SVG overlay must be centered over the rendered reference photo');
  assert.ok(back.overlay.width<=back.photo.width+1 && back.overlay.height<=back.photo.height+1,
    'back SVG overlay must remain inside the rendered reference photo');
  assert.ok(Math.abs(back.overlay.width/back.overlay.height-back.viewBoxRatio)<0.005,
    'back SVG overlay must preserve its anatomical viewBox aspect ratio');
  await page.locator('#muscleHotspots [data-muscle="triceps-long"]').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true })));
  await page.waitForFunction(() => document.querySelector('#muscleHotspots [data-muscle="triceps-long"]')?.classList.contains('selected'));
  await page.screenshot({ path:'artifacts/anatomy-back.png', fullPage:true });
  assert.deepEqual(errors, [], 'no uncaught browser JavaScript errors');
  t.diagnostic(JSON.stringify({ front, back, browserErrors:errors }));
});
test.after(async () => { if(browser) await browser.close(); if(server) await new Promise(resolve=>server.close(resolve)); });

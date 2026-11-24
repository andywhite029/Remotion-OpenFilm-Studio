// The product shot's end-to-end check.
//
// Covers the three things that make a GLB shot different from a DOM shot:
//   1. it must be ready — decoded model and textures — for any seek, including
//      the first one, which starts in the middle of the film;
//   2. the rotation must be a function of the frame, so a reverse seek and a
//      fresh reload produce the same pixels;
//   3. a trim and a text override made in Studio must survive a rebuild, and the
//      exported H.264 must contain the product.
//
// Pixels are counted through ffmpeg, like the other workflow checks: no extra
// image dependency, and what is measured is what the encoder sees.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
import {writeShot} from './product.mjs';
import {productFilmHtml} from './product-timeline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'projects', 'Product-Film');
const filmBefore = await readFile(path.join(source, 'film.html'), 'utf8');
const shotBefore = await readFile(path.join(source, 'product-shot.json'), 'utf8');

// A build must never rewrite the editor's timeline, only the generated parts.
await import('./build.mjs');
assert.equal(await readFile(path.join(source, 'film.html'), 'utf8'), filmBefore, 'Build changed the saved product timeline');
const rebuiltShot = await readFile(path.join(source, 'scenes', 'shot.js'), 'utf8');
assert.ok(rebuiltShot.includes(JSON.parse(shotBefore).title), 'Build did not regenerate shot.js from product-shot.json');
console.log('PASS build preserves the saved timeline and regenerates the shot data');

const tempParent = await realpath(tmpdir());
const temp = await mkdtemp(path.join(tempParent, 'openfilm-product-'));
const project = path.join(temp, 'product');
await cp(source, project, {recursive: true});
// Start from the timeline a new project gets, not from whatever cut the repo's
// film.html currently holds — the edits below are this run's.
await writeFile(path.join(project, 'film.html'), productFilmHtml());

process.env.OPENFILM_HOME = path.join(temp, 'studio');
process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
process.env.OPENFILM_LIBRARY = temp;
process.env.OPENFILM_EXPORTS = path.join(temp, 'exports');
process.env.OPENFILM_NO_UPDATE_CHECK = '1';
await mkdir(process.env.OPENFILM_HOME);

const {startStudio} = await import('openfilm/studio');
const studio = await startStudio({port: 0, stays: true, openBrowser: () => {}});
const headers = {'content-type': 'application/json', 'x-studio-key': studio.key};

async function api(endpoint, body) {
  const response = await fetch(studio.origin + endpoint, {
    headers, method: body ? 'POST' : 'GET', body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const value = await response.json();
  assert.ok(response.ok, JSON.stringify(value));
  return value;
}

const browser = await chromium.launch();
const pass = (message) => console.log(`PASS ${message}`);

try {
  const opened = await api('/api/open', {path: project});
  const base = `/api/projects/${encodeURIComponent(opened.project.id)}`;
  let state = await api(base);

  const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => { if (event.type() === 'error') errors.push(event.text()); });

  const load = async () => {
    await page.goto(new URL('film.html', state.folder).href);
    await page.waitForFunction(() => !!window.film, null, {timeout: 60_000});
    await page.evaluate(async () => { await window.film.ready; });
  };
  const seek = (t) => page.evaluate(async (t) => { await window.film.ready; await window.film.frame(t); }, t);
  const duration = () => page.evaluate(() => window.film.duration);
  const scene = (clip, selector, property = 'textContent') => page.evaluate(([clip, selector, property]) => {
    const frameElement = document.getElementById(clip);
    const element = frameElement?.contentDocument?.querySelector(selector);
    if (!element) return null;
    return property === 'textContent' ? element.textContent : element.style[property];
  }, [clip, selector, property]);

  // ---- 1. the film's first seek lands in the middle of the 3D shot --------
  await load();
  assert.equal(await duration(), 15.5, 'Product film should be 15.5 s before the cut');
  await seek(5);
  assert.equal(await scene('product', '#product-title'), 'BOOMBOX');
  assert.equal(await scene('product', '#product-speed'), 'TURN 55°/s');
  assert.equal(await scene('product', '#product-distance'), 'CAM 4.2m');
  assert.equal(await scene('product', '#boot'), null, 'The loading poster should be gone once a frame is committed');
  const canvas = await page.evaluate(() => {
    const element = document.getElementById('product')?.contentDocument?.querySelector('canvas');
    return element ? `${element.width}x${element.height}` : null;
  });
  assert.equal(canvas, '1920x1080', 'Product canvas should render at full frame');
  console.log('PASS first seek into the middle of the timeline shows the finished product');

  // ---- 2. pixels: product present, rotating, deterministic ----------------
  const shotFile = path.join(temp, 'shots');
  await mkdir(shotFile, {recursive: true});
  const rgb = (file) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
    {maxBuffer: 64 * 1024 * 1024});
  /** Screenshot the frame and decode it to raw RGB, so runs can be compared byte for byte. */
  const capture = async (name) => {
    const file = path.join(shotFile, `${name}.png`);
    await page.screenshot({path: file});
    return {file, pixels: rgb(file)};
  };
  // The HUD is excluded by geometry: headline/caption above y=300, parameter
  // readout right of x=1740, footer note below y=980. The product sits well
  // inside those bounds at the default camera distance.
  const BOX = {x0: 300, y0: 300, x1: 1740, y1: 980};
  const measure = (pixels) => {
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, count = 0, sum = 0, sumSquares = 0;
    for (let y = BOX.y0; y < BOX.y1; y++) {
      for (let x = BOX.x0; x < BOX.x1; x++) {
        const i = (y * 1920 + x) * 3;
        const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        if (lum >= 190) continue;
        count++;
        sum += lum;
        sumSquares += lum * lum;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const mean = sum / Math.max(count, 1);
    return {count, left: minX, right: maxX, top: minY, bottom: maxY,
      width: maxX - minX, height: maxY - minY, mean,
      deviation: Math.sqrt(Math.max(0, sumSquares / Math.max(count, 1) - mean * mean))};
  };
  const shadow = (pixels) => {
    let darker = 0, total = 0;
    // Just under the turntable: y 952..1015, clear of the footer note on the left.
    for (let y = 952; y < 1016; y++) {
      for (let x = 740; x < 1520; x++) {
        const i = (y * 1920 + x) * 3;
        const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        total++;
        if (lum > 190 && lum < 240) darker++;
      }
    }
    return darker / total;
  };
  const ink = (pixels) => {
    let count = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      if (lum < 190) count++;
    }
    return count / (1920 * 1080);
  };

  await seek(3.2);
  const first = await capture('product-3.2');
  const boxFirst = measure(first.pixels);
  console.log('product at 3.2s:', JSON.stringify(boxFirst), 'shadow', shadow(first.pixels).toFixed(3));
  assert.ok(boxFirst.count > 40_000, 'Product silhouette should cover a real area');
  assert.ok(boxFirst.left > BOX.x0 + 20 && boxFirst.right < BOX.x1 - 20, 'Product should not touch the frame edge');
  assert.ok(boxFirst.bottom < BOX.y1 - 10, 'Product should sit above the footer');
  assert.ok(boxFirst.deviation > 12, 'Product should show texture, not a flat silhouette');
  assert.ok(shadow(first.pixels) > 0.02, 'The product should cast a contact shadow on the paper');

  await seek(5.8);
  const last = await capture('product-5.8');
  const boxLast = measure(last.pixels);
  console.log('product at 5.8s:', JSON.stringify(boxLast));
  assert.ok(Math.abs(boxFirst.width - boxLast.width) > 20, 'Turntable should change the silhouette width');

  await seek(4.5);
  const middle = await capture('product-4.5');
  const boxMiddle = measure(middle.pixels);
  console.log('product at 4.5s:', JSON.stringify(boxMiddle));
  assert.ok(!middle.pixels.equals(first.pixels), 'A third angle should render different pixels');

  // Reverse seek: same frame, same pixels.
  await seek(3.2);
  const again = await capture('product-3.2-again');
  assert.deepEqual(again.pixels, first.pixels, 'Reverse seek should reproduce the exact frame');
  console.log('PASS product renders, rotates with the frame and reproduces on reverse seek');

  // Fresh reload: no accumulated state.
  await load();
  await seek(3.2);
  const reload = await capture('product-reload');
  assert.deepEqual(reload.pixels, first.pixels, 'A reloaded page should render the same frame');
  console.log('PASS reload reproduces the same frame');

  // ---- 3. the native title card and the chart still play -----------------
  await seek(1);
  assert.match(await scene('intro', '#title-headline'), /BOOMBOX/);
  const fontLoaded = await page.evaluate(async () => {
    const element = document.getElementById('intro')?.contentDocument?.querySelector('#title-headline');
    const faces = await element.ownerDocument.fonts.load('700 40px "IBM Plex Sans SC"', '光轮智能');
    return faces.some((face) => face.status === 'loaded');
  });
  assert.ok(fontLoaded, 'Title card should use the bundled IBM Plex Sans SC');
  await seek(10);
  const metricsTitle = await page.evaluate(() => {
    const element = document.getElementById('metrics')?.contentDocument;
    return element ? element.body.textContent : '';
  });
  assert.match(metricsTitle, /数字，写在时间轴上/);
  console.log('PASS native title card and Remotion chart render inside the same timeline');

  // ---- 4. the cut and the copy edit, then a rebuild -----------------------
  const edit = await api(base + '/edit', {base: state.rev, ops: [
    {op: 'set', clip: 'intro', field: 'overrides', value: [{at: '#title-subtitle', text: '便携声场 · 65W 快充 · 20 小时续航'}]},
    // Trims and placement are the inspector's properties, not plain fields.
    {op: 'props', edits: [
      {clip: 'product', prop: 'start', value: 0.5},
      {clip: 'metrics', prop: 'at', value: 8.5},
    ]},
  ]});
  assert.ok(edit.rev);
  state = await api(base);
  const editedFilm = await readFile(path.join(project, 'film.html'), 'utf8');
  assert.ok(editedFilm.includes('65W 快充'), 'Text override should be saved in film.html');
  assert.ok(editedFilm.includes('#t=0.5,6'), 'Trim should be saved in film.html');
  assert.ok(editedFilm.includes('at="8.5"'), 'Ripple move should be saved in film.html');

  await load();
  assert.equal(await duration(), 15, 'Trimming 0.5 s off the product head should land the film on 15.0 s');
  await seek(1);
  assert.match(await scene('intro', '#title-subtitle'), /65W 快充/);
  await seek(3.1);
  assert.ok(measure((await capture('after-cut-head')).pixels).count > 40_000, 'The trimmed clip should still show the product at its head');
  await seek(8.4);
  assert.ok(measure((await capture('after-cut-tail')).pixels).count > 40_000, 'The trimmed clip should still show the product at its tail');

  // The cut from the product to the chart at 8.5 s. The host's stage is black,
  // so the next clip's page must paint its own ground before its bundle runs,
  // and the chart must be readable by 1.5 s into the shot — not a second later.
  await seek(8.6);
  const clear = (await capture('cut-clean')).pixels;
  let blackCut = 0;
  for (let i = 0; i < clear.length; i += 3) {
    const lum = 0.2126 * clear[i] + 0.7152 * clear[i + 1] + 0.0722 * clear[i + 2];
    if (lum < 20) blackCut++;
  }
  assert.ok(blackCut / (1920 * 1080) < 0.02, 'A cut must not flash black before the next clip paints');
  await seek(10);
  const chartInk = ink((await capture('chart')).pixels);
  console.log('chart ink at 10s:', `${(chartInk * 100).toFixed(2)}%`);
  assert.ok(chartInk > 0.006, 'The chart shot should have drawn its header and bars by 1.5 s');
  console.log('PASS cut lands on paper (no black flash) and the chart is up by 1.5 s');
  console.log('PASS trim and text override applied in Studio and survived a reload');

  // Rebuild (params + shot.js) without touching the timeline.
  await writeShot(project, {model: 'water-bottle', title: 'AQUA', speed: 70, distance: 3.6});
  assert.equal(await readFile(path.join(project, 'film.html'), 'utf8'), editedFilm, 'Changing parameters must not rewrite film.html');
  await load();
  await seek(5);
  assert.equal(await scene('product', '#product-title'), 'AQUA');
  assert.equal(await scene('product', '#product-speed'), 'TURN 70°/s');
  assert.equal(await scene('product', '#product-distance'), 'CAM 3.6m');
  const bottle = measure((await capture('water-bottle')).pixels);
  console.log('water bottle:', JSON.stringify(bottle));
  assert.ok(bottle.count > 20_000, 'The second model should render too');
  assert.ok(Math.abs(bottle.width - boxFirst.width) > 20 || Math.abs(bottle.height - boxFirst.height) > 20,
    'A different model should change the silhouette');
  // The intro's override only applies while that clip is on screen.
  await seek(1);
  assert.equal(await scene('intro', '#title-headline'), 'AQUA',
    'The title card should follow the model parameter');
  assert.match(await scene('intro', '#title-subtitle'), /65W 快充/,
    'An editor\'s wording should still beat the generated spec');
  console.log('PASS same template generates a second product version, with the editor\'s text and trim intact');

  // ---- 5. export H.264 from the trimmed timeline -------------------------
  const {export: started} = await api(base + '/exports', {kind: 'video', codec: 'h264', fps: 30,
    shortEdge: 360, range: [2.6, 4.6], audio: false, hardware: false, name: 'product'});
  let job;
  for (let i = 0; i < 120; i++) {
    job = (await api(base + '/exports')).exports.find((x) => x.id === started.id);
    if (job?.status === 'done') break;
    if (['failed', 'cancelled'].includes(job?.status)) throw new Error(JSON.stringify(job));
    await delay(500);
  }
  assert.equal(job?.status, 'done', 'Export did not finish');
  assert.equal(job.framesTotal, 60, '2.0 s at 30 fps should be 60 frames');
  const output = job.outputs[0];
  assert.ok((await stat(output)).size > 20_000, 'Exported file is suspiciously small');
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', output]).toString().trim();
  assert.match(probe, /^h264,640,360/, `Unexpected export format: ${probe}`);
  const exported = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.6', '-i', output, '-frames:v', '1',
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], {maxBuffer: 16 * 1024 * 1024});
  let dark = 0;
  for (let i = 0; i < exported.length; i += 3) {
    const lum = 0.2126 * exported[i] + 0.7152 * exported[i + 1] + 0.0722 * exported[i + 2];
    if (lum < 190) dark++;
  }
  assert.ok(dark > 2000, 'Exported frame should contain the product, not an empty stage');
  console.log(`PASS H.264 export: ${probe} · ${job.framesTotal} frames · ${Math.round((await stat(output)).size / 1024)} KiB`);

  assert.deepEqual(errors, [], 'No console or page errors during the run');
  console.log('\nverify-product: every check passed');
} finally {
  try { await browser.close(); } finally {
    try { await studio.close(); } finally {
      const resolved = await realpath(temp);
      assert.equal(path.dirname(resolved), tempParent);
      assert.ok(path.basename(resolved).startsWith('openfilm-product-'));
      await rm(resolved, {recursive: true, force: true, maxRetries: 3});
    }
  }
}

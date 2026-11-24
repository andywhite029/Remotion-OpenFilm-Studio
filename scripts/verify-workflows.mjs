import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const template = path.join(root, 'projects', 'Remotion-Template');
const nativeSource = path.join(root, 'projects', 'OpenFilm-Native', 'film.html');
const original = [template, path.join(root, 'projects', 'ThreeDemo')].map(p => path.join(p, 'film.html'));
original.push(nativeSource);
const before = await Promise.all(original.map(p => readFile(p, 'utf8')));
await import('./build.mjs');
assert.deepEqual(await Promise.all(original.map(p => readFile(p, 'utf8'))), before, 'Build changed a saved timeline');

const tempParent = await realpath(tmpdir());
const temp = await mkdtemp(path.join(tempParent, 'openfilm-workflows-'));
let studio, browser;
try {
  const full = path.join(temp, 'full');
  execFileSync(process.execPath, [path.join(root, 'scripts/new-project.mjs'), full], {stdio: 'inherit'});
  const fullPackage = JSON.parse(await readFile(path.join(full, 'package.json'), 'utf8'));
  assert.ok(fullPackage.dependencies.remotion && fullPackage.dependencies.openfilm);
  for (const file of [
    'adapter/mount-scene.tsx', 'template/src/Root.tsx', 'scripts/studio.mjs',
    'projects/Remotion-Template/film.html', 'projects/ThreeDemo/film.html',
    'projects/OpenFilm-Native/film.html', 'projects/OpenFilm-Native/motion-kit/editorial.html',
    'projects/OpenFilm-Native/public/brand/IBMPlexSansSC-Regular.woff2',
    'projects/OpenFilm-Native/assets/brand/watermarks/guanglun_full-color/16x9/logo_16x9_BR.png',
  ]) {
    assert.deepEqual(await readFile(path.join(full, file)), await readFile(path.join(root, file)), file);
  }
  await assert.rejects(stat(path.join(full, '.studio')), {code: 'ENOENT'});
  await assert.rejects(stat(path.join(full, 'projects', 'Remotion-Template', 'scenes', 'page.js')), {code: 'ENOENT'});
  console.log('PASS default new command copies the complete studio template');

  const native = path.join(temp, 'native');
  execFileSync(process.execPath, [path.join(root, 'scripts/new-project.mjs'), native, '--native'], {stdio: 'inherit'});
  const pkg = JSON.parse(await readFile(path.join(native, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(native, 'package-lock.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies), ['openfilm']);
  assert.deepEqual(Object.keys(lock.packages).sort(), ['', 'node_modules/openfilm', 'node_modules/playwright-core']);
  await assert.rejects(stat(path.join(native, 'adapter')), {code: 'ENOENT'});
  const nativeProject = path.join(native, 'projects', 'OpenFilm-Native');
  await assert.rejects(stat(path.join(nativeProject, '.film', 'id')), {code: 'ENOENT'});

  const mixed = path.join(temp, 'mixed');
  await cp(path.join(nativeProject, 'scenes'), path.join(mixed, 'scenes'), {recursive: true});
  await cp(path.join(template, 'public'), path.join(mixed, 'public'), {recursive: true});
  for (const name of ['title.html', 'page.js']) await cp(path.join(template, 'scenes', name), path.join(mixed, 'scenes', name));
  await writeFile(path.join(mixed, 'film.html'), `<!doctype html><html><head><meta name="viewport" content="width=1920,height=1080"></head><body><section><iframe id="remotion" src="scenes/title.html#t=0,2"></iframe><iframe id="native" at="2" src="scenes/intro.html#t=0,3"></iframe></section></body></html>`);

  const three = path.join(temp, 'three');
  const threeSource = path.join(root, 'projects', 'ThreeDemo');
  for (const name of ['scenes', 'public', 'film.html']) {
    await cp(path.join(threeSource, name), path.join(three, name), {recursive: true});
  }
  process.env.OPENFILM_HOME = path.join(temp, 'studio');
  process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
  process.env.OPENFILM_LIBRARY = temp;
  process.env.OPENFILM_EXPORTS = path.join(temp, 'exports');
  process.env.OPENFILM_NO_UPDATE_CHECK = '1';
  await mkdir(process.env.OPENFILM_HOME);
  const {startStudio} = await import('openfilm/studio');
  studio = await startStudio({port: 0, stays: true, openBrowser: () => {}});

  async function api(endpoint, body) {
    const response = await fetch(studio.origin + endpoint, {
      headers: {'content-type': 'application/json', 'x-studio-key': studio.key},
      method: body ? 'POST' : 'GET', body: body && JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    const value = await response.json();
    assert.ok(response.ok, JSON.stringify(value));
    return value;
  }
  async function open(projectPath) {
    const {project} = await api('/api/open', {path: projectPath});
    const base = `/api/projects/${encodeURIComponent(project.id)}`;
    return [base, await api(base)];
  }
  async function exportVideo(base, range, name) {
    const {export: started} = await api(base + '/exports', {kind: 'video', codec: 'h264', fps: 30, shortEdge: 360, range, audio: false, hardware: false, name});
    for (let i = 0; i < 120; i++) {
      const job = (await api(base + '/exports')).exports.find(x => x.id === started.id);
      if (job?.status === 'done') {
        assert.equal(job.framesTotal, Math.round((range[1] - range[0]) * 30));
        assert.ok((await stat(job.outputs[0])).size > 0);
        console.log(`PASS ${name}: ${job.framesTotal} frames exported`);
        return job.outputs[0];
      }
      if (['failed', 'cancelled'].includes(job?.status)) throw new Error(JSON.stringify(job));
      await delay(500);
    }
    throw new Error(`${name} export timed out`);
  }

  browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (/font|OTS/i.test(event.text())) console.log(event.type(), event.text()); });
  page.on('response', response => { if (/\.otf/.test(response.url())) console.log('FONT response', response.status(), response.request().resourceType()); });
  const load = async state => {
    await page.goto(new URL('film.html', state.folder).href);
    await page.waitForFunction(() => !!window.film);
  };
  const seek = t => page.evaluate(async t => { await window.film.ready; await window.film.frame(t); }, t);
  const value = (selector, property) => page.evaluate(([selector, property]) => {
    for (const f of document.querySelectorAll('iframe')) {
      const el = f.contentDocument?.querySelector(selector);
      if (el) return property === 'text' ? el.textContent : el.style[property];
    }
    return null;
  }, [selector, property]);

  async function assertBrandFont(frame, selector, weight) {
    const font = await page.frameLocator(frame).locator(selector).evaluate(async (el, weight) => {
      const faces = await document.fonts.load(`${weight} 40px "IBM Plex Sans SC"`, '光轮智能');
      return {family: getComputedStyle(el).fontFamily, loaded: faces.some(face => face.status === 'loaded')};
    }, weight);
    assert.match(font.family, /IBM Plex Sans SC/);
    assert.ok(font.loaded, `IBM Plex Sans SC ${weight} did not load`);
  }

  const [nativeBase, nativeState] = await open(nativeProject);
  await load(nativeState);
  await seek(1);
  await assertBrandFont('iframe#intro', '#intro-title', 700);
  await assertBrandFont('iframe#intro', '#intro-caption', 400);
  const mark = async t => { await seek(t); return value('#intro-mark', 'transform'); };
  const frame = await mark(.23);
  assert.ok(frame?.startsWith('rotate('));
  assert.notEqual(await mark(.231), frame, 'Native sub-frame sample should move');
  assert.notEqual(await mark(1.2), frame);
  assert.equal(await mark(.23), frame, 'Native reverse seek not repeatable');
  await seek(4);
  assert.match(await value('#metrics-title', 'text'), /两种镜头/);
  const brandedOutput = await exportVideo(nativeBase, [.1, .7], 'native');
  const watermarkPixels = execFileSync('ffmpeg', ['-v', 'error', '-i', brandedOutput, '-vf', 'crop=98:32:530:320',
    '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  let brightPixels = 0;
  for (let i = 0; i < watermarkPixels.length; i += 3) {
    if (Math.min(watermarkPixels[i], watermarkPixels[i + 1], watermarkPixels[i + 2]) > 190) brightPixels++;
  }
  assert.ok(brightPixels > 100, 'Official white watermark was not visible in the native video export');

  const motionProject = path.join(temp, 'motion-preview');
  for (const name of ['motion-kit', 'public']) {
    await cp(path.join(nativeProject, name), path.join(motionProject, name), {recursive: true});
  }
  await writeFile(path.join(motionProject, 'film.html'), `<!doctype html><html><head><meta name="viewport" content="width=1920,height=1080"></head><body><section><iframe id="editorial" src="motion-kit/editorial.html#t=0,4"></iframe><iframe id="data" at="4" src="motion-kit/data-trace.html#t=0,5"></iframe><iframe id="product" at="9" src="motion-kit/product-focus.html#t=0,4.5"></iframe></section></body></html>`);
  const [motionBase, motionState] = await open(motionProject);
  await load(motionState);
  for (const [start, selector, property] of [
    [0, '.reveal', 'clipPath'], [4, '#evidence-line', 'strokeDashoffset'], [9, '#product-capture', 'transform'],
  ]) {
    await seek(start + .5);
    const earlier = await value(selector, property);
    assert.ok(earlier);
    await seek(start + 2.6);
    assert.notEqual(await value(selector, property), earlier);
    await seek(start + .5);
    assert.equal(await value(selector, property), earlier);
  }

  await exportVideo(motionBase, [3.7, 10], 'motion-kit');

  const [mixedBase, state] = await open(mixed);
  await load(state);
  await seek(1);
  const title = await page.evaluate(() => [...document.querySelector('iframe').contentDocument.querySelectorAll('[id]')]
    .find(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.includes('把视频')))?.id);
  assert.match(title, /^of-title-/);
  await assertBrandFont('iframe#remotion', `#${title}`, 700);
  await api(mixedBase + '/edit', {base: state.rev, ops: [
    {op: 'set', clip: 'remotion', field: 'overrides', value: [{at: `#${title}`, text: 'Remotion 镜头已编辑'}]},
    {op: 'set', clip: 'native', field: 'overrides', value: [{at: '#intro-title', text: 'OpenFilm 镜头已编辑', t: [36, 12]}]},
  ]});
  const saved = await api(mixedBase);
  await load(saved);
  for (const t of [1, 2.5, 1, 2.5]) {
    await seek(t);
    if (t < 2) assert.match(await value(`#${title}`, 'text'), /Remotion 镜头已编辑/);
    else {
      assert.match(await value('#intro-title', 'text'), /OpenFilm 镜头已编辑/);
      assert.equal(await value('#intro-title', 'translate'), '36px 12px');
    }
  }
  await exportVideo(mixedBase, [1.7, 2.7], 'mixed');
  const [threeBase, threeState] = await open(three);
  await load(threeState);
  await seek(1);
  const canvas = page.frameLocator('iframe').locator('canvas');
  assert.ok(await canvas.evaluate(c => c.width > 0 && c.height > 0 && !!c.getContext('webgl2')));
  const crop = {x: 760, y: 340, width: 400, height: 400};
  const shot = await page.screenshot({clip: crop});
  await seek(2);
  assert.notDeepEqual(await page.screenshot({clip: crop}), shot, 'WebGL did not visibly advance');
  await exportVideo(threeBase, [.2, .8], 'three');
  assert.deepEqual(errors, []);
  console.log('PASS local brand font in both workflows, official watermark in exported video, and three seekable motion presets');
  console.log('PASS rebuild preservation, native clone, deterministic seeking, and mixed clip overrides after reload');
} finally {
  try { await browser?.close(); } finally {
    try { await studio?.close(); } finally {
      const resolved = await realpath(temp);
      assert.equal(path.dirname(resolved), tempParent);
      assert.ok(path.basename(resolved).startsWith('openfilm-workflows-'));
      await rm(resolved, {recursive: true, force: true, maxRetries: 3});
    }
  }
}

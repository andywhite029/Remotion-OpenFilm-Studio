// The UE → Studio handoff, end to end.
//
//   node scripts/verify-ue.mjs
//
// Covers what the tool promises: renders become video clips in the right order,
// the rest of the timeline is untouched, a wrong-sized render is refused with a
// message that says what to change, a re-rendered shot replaces the picture but
// not the cut, and the film plays and exports from Studio.
//
// The "renders" are made with ffmpeg here, so the check runs without Unreal.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const linker = path.join(root, 'scripts', 'ue-link.mjs');
const tempParent = await realpath(tmpdir());
const temp = await mkdtemp(path.join(tempParent, 'openfilm-ue-'));
const project = path.join(temp, 'film');
const ueDir = path.join(project, 'media', 'ue');

const film = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=1920, height=1080"></head><body>
<section>
  <iframe id="overlay" src="overlay.html#t=0,9"></iframe>
</section>
<section></section>
</body></html>
`;
const overlay = `<!doctype html>
<html><head><style>html,body{margin:0;background:transparent}#mark{position:absolute;left:40px;top:40px;width:140px;height:140px;background:#e11d48}</style></head>
<body><div id="mark"></div><script>window.film={width:1920,height:1080,duration:9,ready:Promise.resolve(),frame(){}}</script></body></html>
`;

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], {stdio: ['ignore', 'pipe', 'pipe']});

async function makeRenders(dir, {colour = 'testsrc2', seconds = 4} = {}) {
  await mkdir(path.join(dir, 'shot-b'), {recursive: true});
  ff(['-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=30:duration=${seconds}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(dir, 'shot-a.mp4')]);
  ff(['-f', 'lavfi', '-i', `smptebars=size=1920x1080:rate=30:duration=3`, '-frames:v', '90', path.join(dir, 'shot-b', 'shot-b_%04d.png')]);
  ff(['-f', 'lavfi', '-i', `rgbtestsrc=size=1920x1080:rate=30:duration=2`, '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', path.join(dir, 'shot-c.mov')]);
}

function link(args) {
  const result = spawn(linker, ['--project', project, ...args]);
  return result;
}

function spawn(script, args) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024}).toString();
    return {status: 0, output: stdout};
  } catch (error) {
    return {status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}`};
  }
}

let studio, browser;
try {
  await mkdir(ueDir, {recursive: true});
  await writeFile(path.join(project, 'film.html'), film);
  await writeFile(path.join(project, 'overlay.html'), overlay);
  await makeRenders(ueDir);

  // ---- a wrong-sized render is refused, and the message says what to change
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(ueDir, 'shot-bad.mp4')]);
  const refused = link([]);
  assert.notEqual(refused.status, 0, 'A 720p render should be refused');
  assert.match(refused.output, /1280×720/);
  assert.match(refused.output, /--reencode/);
  const untouched = await readFile(path.join(project, 'film.html'), 'utf8');
  assert.equal(untouched, film, 'A refused run must not touch film.html');
  await rm(path.join(ueDir, 'shot-bad.mp4'));
  console.log('PASS a render off the project spec is refused, and film.html is left alone');

  // ---- ProRes is a fine master but not previewable: refused until told to transcode
  const refusedCodec = link([]);
  assert.notEqual(refusedCodec.status, 0, 'A ProRes render should be refused for the live timeline');
  assert.match(refusedCodec.output, /prores/);
  assert.match(refusedCodec.output, /--reencode/);
  assert.equal(await readFile(path.join(project, 'film.html'), 'utf8'), film);
  console.log('PASS ProRes is refused until --reencode says to make a previewable copy');

  // ---- link three renders
  const linked = link(['--reencode']);
  assert.equal(linked.status, 0, linked.output);
  const afterLink = await readFile(path.join(project, 'film.html'), 'utf8');
  assert.match(afterLink, /<section id="ue-shots" title="UE 镜头">/);
  for (const [id, at] of [['shot-a', 0], ['shot-b', 4], ['shot-c', 7]]) {
    const tag = new RegExp(`<video id="${id}" src="([^"#]+)"(?: at="${at}")?>`);
    const found = tag.exec(afterLink);
    assert.ok(found, `${id} should be a video clip at ${at}s:\n${afterLink}`);
    assert.ok(found[1].endsWith('.mp4'), `${id} should point at a browser-playable mp4, got ${found[1]}`);
  }
  assert.match(afterLink, /<video id="shot-b" src="media\/ue\/_linked\/shot-b-\d+\.mp4" at="4">/);
  // The editor's own track is byte-identical: the tool only adds to its own.
  assert.ok(afterLink.includes(film.split('<section></section>')[0]));
  const manifest = JSON.parse(await readFile(path.join(ueDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.shots.map((s) => [s.id, s.frames, s.clipAt]), [['shot-a', 120, 0], ['shot-b', 90, 4], ['shot-c', 60, 7]]);
  console.log('PASS three renders become ordered video clips; the other track is untouched');

  // ---- Studio plays it
  process.env.OPENFILM_HOME = path.join(temp, 'studio');
  process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
  process.env.OPENFILM_LIBRARY = temp;
  process.env.OPENFILM_EXPORTS = path.join(temp, 'exports');
  process.env.OPENFILM_NO_UPDATE_CHECK = '1';
  await mkdir(process.env.OPENFILM_HOME);
  const {startStudio} = await import('openfilm/studio');
  studio = await startStudio({port: 0, stays: true, openBrowser: () => {}});
  const headers = {'content-type': 'application/json', 'x-studio-key': studio.key};
  const api = async (endpoint, body) => {
    const response = await fetch(studio.origin + endpoint, {
      headers, method: body ? 'POST' : 'GET', body: body && JSON.stringify(body), signal: AbortSignal.timeout(120_000),
    });
    const value = await response.json();
    assert.ok(response.ok, JSON.stringify(value));
    return value;
  };
  const opened = await api('/api/open', {path: project});
  const base = `/api/projects/${encodeURIComponent(opened.project.id)}`;
  let state = await api(base);

  browser = await chromium.launch();
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
  const rgb = (file) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], {maxBuffer: 64 * 1024 * 1024});
  const capture = async (name) => {
    const file = path.join(temp, `${name}.png`);
    await page.screenshot({path: file});
    return rgb(file);
  };
  const meanIn = (pixels, x, y, w, h) => {
    let sum = 0, n = 0;
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        const i = (row * 1920 + col) * 3;
        sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
        n += 3;
      }
    }
    return sum / n;
  };

  await load();
  assert.equal(await page.evaluate(() => window.film.duration), 9, 'The film should be 4 + 3 + 2 s long');
  await seek(2);
  const a = await capture('a');
  await seek(5);
  const b = await capture('b');
  await seek(8);
  const c = await capture('c');
  assert.ok(!a.equals(b) && !b.equals(c), 'Each shot should look different');
  // The overlay is the top track: its mark is in the corner of every frame.
  assert.ok(meanIn(a, 60, 60, 100, 100) < 200, 'The overlay page should draw over the footage');
  console.log('PASS Studio plays the linked clips in order, under the existing overlay track');

  // ---- an editor trims shot-a; a re-render replaces the picture, not the cut
  const edit = await api(base + '/edit', {base: state.rev, ops: [{op: 'props', edits: [{clip: 'shot-a', prop: 'start', value: 1}]}]});
  assert.ok(edit.rev);
  state = await api(base);
  const trimmed = await readFile(path.join(project, 'film.html'), 'utf8');
  assert.match(trimmed, /<video id="shot-a" src="media\/ue\/shot-a\.mp4#t=1">/, 'Studio writes a head trim as "from 1 s to the end"');
  const durationBefore = await page.evaluate(() => window.film.duration);

  // UE re-renders shot-a: different picture, longer file.
  ff(['-f', 'lavfi', '-i', 'rgbtestsrc=size=1920x1080:rate=30:duration=5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(ueDir, 'shot-a.mp4')]);
  const relinked = link([]);
  assert.equal(relinked.status, 0, relinked.output);
  const afterRelink = await readFile(path.join(project, 'film.html'), 'utf8');
  assert.match(afterRelink, /<video id="shot-a" src="media\/ue\/_linked\/shot-a-\d+\.mp4#t=1,4">/,
    'A longer re-render must pin the end where the cut had it, on a new file name');
  assert.doesNotMatch(afterRelink, /t=1,5/, 'A re-render must not stretch the cut');

  await load();
  assert.equal(await page.evaluate(() => window.film.duration), durationBefore, 'A re-render must keep the cut in place');
  await seek(1.5);
  const rerendered = await capture('rerendered');
  assert.ok(!rerendered.equals(a), 'The new render should be on screen');
  console.log('PASS a re-rendered shot replaces the picture and keeps the trim and the cut');

  // ---- the film exports
  const {export: started} = await api(base + '/exports', {kind: 'video', codec: 'h264', fps: 30,
    shortEdge: 360, range: [1, 3], audio: false, hardware: false, name: 'ue'});
  let job;
  for (let i = 0; i < 180; i++) {
    job = (await api(base + '/exports')).exports.find((x) => x.id === started.id);
    if (job?.status === 'done') break;
    if (['failed', 'cancelled'].includes(job?.status)) throw new Error(JSON.stringify(job));
    await delay(500);
  }
  assert.equal(job?.status, 'done', 'Export did not finish');
  assert.equal(job.framesTotal, 60, '2 s at 30 fps should be 60 frames');
  assert.ok((await stat(job.outputs[0])).size > 10_000);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=codec_name,width,height', '-of', 'csv=p=0', job.outputs[0]]).toString().trim();
  assert.match(probe, /^h264,640,360/, `Unexpected export format: ${probe}`);
  console.log(`PASS H.264 export from the linked timeline: ${probe} · ${job.framesTotal} frames`);

  assert.deepEqual(errors, [], 'No console or page errors during the run');
  console.log('\nverify-ue: every check passed');
} finally {
  try { await browser?.close(); } finally {
    try { await studio?.close(); } finally {
      const resolved = await realpath(temp);
      assert.equal(path.dirname(resolved), tempParent);
      assert.ok(path.basename(resolved).startsWith('openfilm-ue-'));
      await rm(resolved, {recursive: true, force: true, maxRetries: 3});
    }
  }
}

#!/usr/bin/env node
// Link UE renders into an OpenFilm timeline.
//
// The division of labour this tool assumes: Unreal renders each shot (MRQ →
// H.264, ProRes or a PNG sequence); OpenFilm's timeline owns the cut, the
// trims, the titles and the sound. So the tool never re-times an existing clip:
// it validates the renders, encodes what the browser cannot play, adds the
// clips that are new, and for a re-rendered shot it only replaces the picture —
// the editor's trim, `at`, keyframes and fades stay exactly as they are.
//
//   npm run ue:link -- --project projects/MyFilm
//   npm run ue:link -- --project projects/MyFilm --dry-run
//   npm run ue:link -- --project projects/MyFilm --fps 25 --reencode
//
// Convention, under the project folder:
//
//   media/ue/<shotId>.mov | .mp4 | .m4v …     one render per shot
//   media/ue/<shotId>/<name>_0001.png …       or a numbered sequence
//   media/ue/shots.json                       optional: order, at, in, out, title
//
// The resulting clips carry `id="<shotId>"`, so the manifest
// (`media/ue/manifest.json`) and Studio's clip ids are the same names.

import {execFileSync} from 'node:child_process';
import {copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {filmHtml, readFilmFile} from 'openfilm/film-doc';

const FILM = 'film.html';
const UE_DIR = path.join('media', 'ue');
const MANIFEST = path.join(UE_DIR, 'manifest.json');
const SHOTS = path.join(UE_DIR, 'shots.json');
/** What this tool encodes goes here, beside the renders and never over them. */
const OUT_DIR = path.join(UE_DIR, '_linked');
const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.ogv']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.exr', '.tif', '.tiff']);
/** Chromium decodes these itself, which is what Studio's live timeline needs: a
 * clip it cannot decode is a film error, not a black frame. ProRes and HEVC are
 * handled only by the *render* path (src/seekable.mjs), so a clip that must play
 * in Studio has to be one of these. */
const PLAYABLE = new Set(['h264', 'vp9', 'av1', 'vp8']);
const CLIP_ID = /^[A-Za-z][\w-]*$/;

const {values} = parseArgs({allowPositionals: false, options: {
  project: {type: 'string'},
  fps: {type: 'string', default: '30'},
  track: {type: 'string', default: 'ue-shots'},
  start: {type: 'string'},
  order: {type: 'string'},
  lut: {type: 'string'},
  crf: {type: 'string', default: '14'},
  reencode: {type: 'boolean'},
  'dry-run': {type: 'boolean'},
  help: {type: 'boolean'},
}});

if (values.help || !values.project) {
  console.log(`Usage: npm run ue:link -- --project <folder> [options]

把 UE（MRQ）渲好的镜头接进 OpenFilm 时间线。

  --project <folder>   项目目录（含 film.html），必填
  --fps <n>            期望帧率，默认 30（要和 Studio 的导出帧率一致）
  --track <id>         承载 UE 镜头的轨道 id，默认 ue-shots（自动创建在最底层）
  --start <sec>        新建轨道时第一镜的起点，默认 0
  --order a,b,c        显式指定镜头顺序（默认按文件名）
  --lut <file.cube>    序列/转码时套一个 3D LUT（EXR 或 Log 素材用）
  --crf <n>            转码质量，默认 14（越小越清晰、文件越大）
  --reencode           规格或编码不符时转成 H.264（Studio 实时预览只解 h264/vp9/av1）
  --dry-run            只报告，不写 film.html、不编码

约定：镜头放 <项目>/media/ue/<shotId>.mov 或 <shotId>/<name>_0001.png；
     可选 <项目>/media/ue/shots.json 指定顺序、at、in、out、title。
     工具自己编码的副本写在 media/ue/_linked/，不会覆盖 UE 的渲染。
`);
  process.exit(values.help ? 0 : 1);
}

const fps = Number(values.fps);
if (!Number.isFinite(fps) || fps <= 0) fail(`--fps 要是正数，收到 ${values.fps}`);
const crf = Number(values.crf);
if (!Number.isFinite(crf) || crf < 0 || crf > 35) fail(`--crf 要在 0–35，收到 ${values.crf}`);
const dryRun = values['dry-run'] === true;

const project = path.resolve(values.project);
const filmFile = path.join(project, FILM);
const ueDir = path.join(project, UE_DIR);
const outDir = path.join(project, OUT_DIR);

let before;
try {
  before = await readFile(filmFile, 'utf8');
} catch {
  fail(`找不到 ${filmFile}。先建项目（npm run new -- <目录>），再放 UE 渲染。`);
}
const read = readFilmFile(before);
if (!read.doc || read.problems.length > 0) fail(`${FILM} 读不通：\n  ${read.problems.join('\n  ')}`);
const doc = read.doc;
const stage = doc.stage;

const shots = await collect(ueDir);
if (shots.length === 0) fail(`${ueDir} 里没有可用镜头。放 <shotId>.mov/.mp4，或 <shotId>/ 里的 PNG 序列。`);
if (!dryRun) await mkdir(outDir, {recursive: true});

const previous = await readPrevious();

// --- validate, and give every shot a file the browser can play ---------------

for (const shot of shots) {
  if (!CLIP_ID.test(shot.id)) fail(`镜头名 "${shot.id}" 不能当片段 id：用字母开头，只含字母、数字、-、_`);
  const prior = previous.get(shot.id);
  /* The newest file that makes up this shot: a sequence's frames or the render
   * itself. It is the name every copy here gets — the film format escapes `?`,
   * so a changed picture cannot be cache-busted with a query string, only with a
   * new file name. */
  const sourceMtime = Math.round(shot.sequence
    ? Math.max(...shot.frames.map((frame) => frame.mtimeMs))
    : (await stat(shot.file).catch(() => null))?.mtimeMs ?? 0);
  if (!sourceMtime) fail(`${path.basename(shot.file)} 读不到修改时间`);
  const versioned = path.join(outDir, `${shot.id}-${sourceMtime}.mp4`);
  shot.sourceMtime = sourceMtime;

  if (shot.sequence) {
    if (!dryRun && !(await exists(versioned))) await encodeSequence(shot, versioned, fps);
    const size = await probeSize(shot.frames[0].file);
    Object.assign(shot, {file: versioned, width: size.w, height: size.h, fps, codec: 'h264', duration: shot.frames.length / fps});
  } else {
    const info = await probe(shot.file);
    const offSpec = Math.abs(info.width - stage.w) > 0 || Math.abs(info.height - stage.h) > 0 || Math.abs(info.fps - fps) > 0.02;
    const unplayable = !PLAYABLE.has(info.codec);
    if (offSpec || unplayable || values.lut) {
      const there = await exists(versioned);
      if (!there) {
        if (!values.reencode && !values.lut) {
          const why = unplayable
            ? `是 ${info.codec}，Studio 的实时预览打不开（浏览器只解 h264 / vp9 / av1）`
            : `是 ${info.width}×${info.height} ${info.fps.toFixed(3)}fps，项目要 ${stage.w}×${stage.h} ${fps}fps`;
          fail(`${path.relative(project, shot.file)} ${why}。\n` +
            '  在 UE 的 MRQ 里直接出 H.264（mp4）；或加 --reencode 让工具转成 H.264 CRF ' + crf + '。\n' +
            '  ProRes/EXR 适合做母版，但要先转码才能在 Studio 里剪。');
        }
        if (!dryRun) await transcode(shot.file, versioned, fps, stage, values.lut);
      }
      const ready = there || !dryRun ? await probe(versioned) : info;
      Object.assign(shot, {file: versioned, width: stage.w, height: stage.h, fps, codec: 'h264', duration: ready.duration});
    } else if (prior !== undefined && prior.mtime !== sourceMtime) {
      // The render changed under the old name: copy it to a new one, or the
      // browser plays the picture it already has.
      if (!dryRun && !(await exists(versioned))) await copyFile(shot.file, versioned);
      Object.assign(shot, {file: versioned, width: info.width, height: info.height, fps: info.fps, duration: info.duration, codec: info.codec});
    } else {
      Object.assign(shot, {width: info.width, height: info.height, fps: info.fps, duration: info.duration, codec: info.codec});
    }
  }
  if (!(shot.duration > 0)) fail(`${shot.id} 的时长是 0，渲染可能失败`);
}

// One copy per shot: a superseded version is not linked any more.
if (!dryRun) await prune(shots.map((shot) => path.basename(shot.file)));

// --- place the clips ---------------------------------------------------------

const trackId = values.track;
let track = doc.tracks.find((t) => t.attrs?.id === trackId);
if (!track) {
  track = {clips: [], attrs: {id: trackId, title: 'UE 镜头'}};
  doc.tracks.push(track); // appending = the bottom track: overlays sit on top of it
}
let cursor = values.start === undefined ? lastEnd(track) : Number(values.start);
if (!Number.isFinite(cursor) || cursor < 0) fail(`--start 要是秒数，收到 ${values.start}`);

const elsewhere = new Map();
doc.tracks.forEach((t, ti) => { if (t !== track) t.clips.forEach((c) => elsewhere.set(c.id, ti)); });

const manifest = {fps, stage, track: trackId, shots: []};
for (const shot of shots) {
  const bare = path.relative(project, shot.file).split(path.sep).join('/');
  const existing = track.clips.find((c) => c.id === shot.id);
  if (existing) {
    const time = Array.isArray(existing.time) ? [...existing.time] : [];
    const start = time[0] ?? 0;
    const prior = previous.get(shot.id);
    if (time.length === 2 && time[1] > shot.duration + 1e-6) {
      fail(`${shot.id} 的新渲染只有 ${shot.duration.toFixed(3)}s，但剪辑用到 ${time[1]}s。` +
        '先把它在 Studio 里缩短，或重新渲染足够长的版本。');
    }
    if (time.length < 2 && prior !== undefined && Math.abs(prior.duration - shot.duration) > 1e-6) {
      if (prior.duration > shot.duration + 1e-6) {
        fail(`${shot.id} 的新渲染只有 ${shot.duration.toFixed(3)}s，上次接进来的是 ${prior.duration}s。` +
          '剪辑是按旧长度裁的，要么重渲够长，要么先在 Studio 里改短它。');
      }
      // A trim Studio wrote as "from 1 s to the end" has no end in film.html:
      // pin it where the cut had it, or a longer render would stretch the cut.
      existing.time = [start, round(prior.duration)];
    }
    existing.src = bare;              // the picture is replaced; the cut is not touched
    shot.clipAt = Number(existing.at ?? 0);
    shot.in = existing.time?.[0] ?? 0;
    shot.out = existing.time?.[1] ?? shot.duration;
    shot.action = '更新画面';
    cursor = Math.max(cursor, shot.clipAt + clipLength(existing, shot.duration));
  } else if (elsewhere.has(shot.id)) {
    fail(`片段 id "${shot.id}" 已经在第 ${elsewhere.get(shot.id) + 1} 条轨道上。换一个镜头名，或先在 Studio 里改名。`);
  } else {
    const clip = {id: shot.id, src: bare, at: round(cursor)};
    if (shot.title) clip.title = shot.title;
    const trim = trimOf(shot);
    if (trim) clip.time = trim;
    track.clips.push(clip);
    shot.clipAt = Number(clip.at);
    shot.in = clip.time?.[0] ?? 0;
    shot.out = clip.time?.[1] ?? shot.duration;
    shot.action = '新建';
    cursor = shot.clipAt + (shot.out - shot.in);
  }
  manifest.shots.push({
    id: shot.id, file: bare, width: shot.width, height: shot.height, fps: shot.fps,
    frames: shot.sequence ? shot.frames.length : Math.round(shot.duration * shot.fps),
    duration: round(shot.duration), clipAt: round(shot.clipAt), in: round(shot.in), out: round(shot.out),
    mtime: shot.sourceMtime,
  });
}
track.clips.sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0));

const next = filmHtml(doc, before);
const check = readFilmFile(next);
if (!check.doc || check.problems.length > 0) fail(`改完的 ${FILM} 读不通（工具 bug）：\n  ${check.problems.join('\n  ')}`);

if (dryRun) {
  print(shots, true);
  process.exit(0);
}
await writeFile(filmFile, next);
await writeFile(path.join(project, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
print(shots, false);
console.log(`\n写入 ${FILM}：只改了轨道 "${trackId}"，其余轨道与人工剪辑未动。`);
console.log(`清单：${MANIFEST}（给 UE 侧对账：镜头名 = 片段 id）。`);

// --- helpers -----------------------------------------------------------------

function fail(message) {
  console.error(`ue:link: ${message}`);
  process.exit(1);
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

/** What the last run linked: shot id → its file's length and modification time
 * then. The time tells a replaced render from an untouched one. */
async function readPrevious() {
  try {
    const parsed = JSON.parse(await readFile(path.join(project, MANIFEST), 'utf8'));
    return new Map((parsed.shots ?? []).map((shot) => [shot.id, {duration: Number(shot.duration), mtime: Number(shot.mtime ?? 0)}]));
  } catch {
    return new Map();
  }
}

async function exists(file) {
  return (await stat(file).catch(() => null))?.isFile() === true;
}

/** The length a clip takes on the film, when film.html says it. */
function clipLength(clip, fallback = 0) {
  // `time: [start]` means "to the end", so the length lives in the file, not here.
  if (Array.isArray(clip.time) && clip.time.length === 2) return Math.max(0, clip.time[1] - clip.time[0]);
  return fallback;
}

function lastEnd(t) {
  return t.clips.reduce((end, clip) => Math.max(end, Number(clip.at ?? 0) + clipLength(clip)), 0);
}

function trimOf(shot) {
  const inSec = shot.in ?? 0;
  const outSec = shot.out ?? shot.duration;
  if (inSec <= 0 && outSec >= shot.duration) return undefined;
  return [round(inSec), round(outSec)];
}

function exec(command, args, label) {
  try {
    return execFileSync(command, args, {stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024}).toString();
  } catch (error) {
    fail(`${label} 失败：${command} ${args.join(' ')}\n${error.stderr?.toString().trim() ?? error.message}`);
  }
}

async function probe(file) {
  const data = JSON.parse(exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration,codec_name:format=duration', '-of', 'json', file], `ffprobe ${path.basename(file)}`));
  const stream = data.streams?.[0];
  if (!stream) fail(`${path.basename(file)} 里没有视频流`);
  const [num, den] = String(stream.r_frame_rate ?? '0/1').split('/').map(Number);
  const rate = den ? num / den : 0;
  const duration = Number(stream.duration ?? data.format?.duration ?? 0);
  return {width: stream.width, height: stream.height, fps: rate, duration, codec: stream.codec_name,
    frames: Number(stream.nb_frames ?? 0) || Math.round(duration * rate)};
}

async function probeSize(file) {
  const data = JSON.parse(exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', file], `ffprobe ${path.basename(file)}`));
  const stream = data.streams?.[0];
  if (!stream) fail(`${path.basename(file)} 读不出尺寸`);
  return {w: stream.width, h: stream.height};
}

async function collect(dir) {
  const entries = await readdir(dir, {withFileTypes: true}).catch(() => []);
  const found = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    if (entry.isFile() && VIDEO_EXT.has(path.extname(entry.name).toLowerCase())) {
      found.push({id: path.basename(entry.name, path.extname(entry.name)), file: path.join(dir, entry.name), sequence: false});
    } else if (entry.isDirectory()) {
      const files = (await readdir(path.join(dir, entry.name)))
        .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
        .sort();
      if (files.length === 0) continue;
      const numbered = files.map((name) => {
        const match = /^(.*?)(\d+)(\.[^.]+)$/.exec(name);
        if (!match) fail(`序列 ${entry.name}/${name} 的文件名里没有帧号（要像 shot_0001.png）`);
        return {name, prefix: match[1], digits: match[2], ext: match[3], number: Number(match[2])};
      });
      const shapes = new Set(numbered.map((file) => `${file.prefix}|${file.digits.length}|${file.ext}`));
      if (shapes.size > 1) fail(`序列 ${entry.name} 的文件名不统一（前缀、补零位数、扩展名要一致）`);
      const numbers = numbered.map((file) => file.number).sort((a, b) => a - b);
      for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] !== numbers[i - 1] + 1) fail(`序列 ${entry.name} 缺帧：${numbers[i - 1]} → ${numbers[i]}`);
      }
      const frames = await Promise.all(files.map(async (name) => {
        const file = path.join(dir, entry.name, name);
        return {file, name, mtimeMs: (await stat(file)).mtimeMs};
      }));
      found.push({id: entry.name, sequence: true, dir: path.join(dir, entry.name),
        pattern: `${numbered[0].prefix}%0${numbered[0].digits.length}d${numbered[0].ext}`,
        startNumber: numbers[0], frames});
    }
  }
  if (found.length === 0) return [];
  const ids = found.map((shot) => shot.id);
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (duplicates.length > 0) fail(`镜头名重复：${duplicates.join(', ')}。每个 shotId 只能出现一次。`);
  let ordered = [...found].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  if (values.order) {
    const wanted = values.order.split(',').map((s) => s.trim()).filter(Boolean);
    const byId = new Map(found.map((shot) => [shot.id, shot]));
    const missing = wanted.filter((id) => !byId.has(id));
    if (missing.length) fail(`--order 里的镜头没有渲染：${missing.join(', ')}`);
    const rest = found.filter((shot) => !wanted.includes(shot.id));
    if (rest.length) console.log(`  另有未排序的镜头（已忽略）：${rest.map((s) => s.id).join(', ')}`);
    ordered = wanted.map((id) => byId.get(id));
  }
  const overrides = await readShots();
  return ordered.map((shot) => ({...shot, ...(overrides.get(shot.id) ?? {})}));
}

async function readShots() {
  let raw;
  try {
    raw = await readFile(path.join(project, SHOTS), 'utf8');
  } catch {
    return new Map();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`${SHOTS} 不是合法 JSON：${error.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.shots;
  if (!Array.isArray(list)) fail(`${SHOTS} 要是 {"shots": [...]} 或数组`);
  const allowed = new Set(['id', 'at', 'in', 'out', 'title']);
  const map = new Map();
  for (const item of list) {
    if (!item?.id) fail(`${SHOTS} 里每一项都要有 id`);
    const extra = Object.keys(item).filter((key) => !allowed.has(key));
    if (extra.length) fail(`${SHOTS} 的 ${item.id} 有不认识的字段：${extra.join(', ')}`);
    if (map.has(item.id)) fail(`${SHOTS} 里 ${item.id} 出现了两次`);
    map.set(item.id, item);
  }
  return map;
}

/**
 * One encoding for every entry point: H.264 in mp4. Studio's live timeline
 * decodes only h264/vp9/av1, and the film's own export is H.264 4:2:0 anyway, so
 * a 10-bit master would be re-encoded later regardless. `-g rate` keeps a key
 * frame every second (scrubbing), `+faststart` lets playback start early.
 */
function encodeArgs(rate, size, lut) {
  const filters = [`fps=${rate}`];
  if (size) filters.push(`scale=${size.w}:${size.h}:flags=lanczos`);
  if (lut) filters.push(`lut3d=${lut.replace(/\\/g, '/')}`);
  return ['-vf', filters.join(','), '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-g', String(Math.round(rate)), '-movflags', '+faststart'];
}

async function encodeSequence(shot, out, rate) {
  await rm(out, {force: true});
  exec('ffmpeg', ['-y', '-v', 'error', '-start_number', String(shot.startNumber), '-framerate', String(rate),
    '-i', path.join(shot.dir, shot.pattern), ...encodeArgs(rate, null, values.lut), out], `编码 ${shot.id}`);
}

async function transcode(file, out, rate, size, lut) {
  const tmp = `${out}.tmp.mp4`;
  await rm(tmp, {force: true});
  exec('ffmpeg', ['-y', '-v', 'error', '-i', file, ...encodeArgs(rate, size, lut), tmp], `转码 ${path.basename(file)}`);
  await rm(out, {force: true});
  await rename(tmp, out);
}

/** Drop copies this run did not link: one file per shot, no growing pile. */
async function prune(keep) {
  const names = await readdir(outDir).catch(() => []);
  const linked = new Set(keep);
  for (const name of names) {
    if (!/\.mp4$/.test(name) || linked.has(name)) continue;
    if (/^[A-Za-z][\w-]*(-\d+)?\.mp4$/.test(name)) await rm(path.join(outDir, name), {force: true});
  }
}

function print(list, preview) {
  console.log(preview ? '\nUE → film.html（预览，不写文件）' : '\nUE → film.html');
  console.log(`  轨道 ${values.track} · ${stage.w}×${stage.h} · ${fps}fps`);
  for (const shot of list) {
    const spec = `${shot.width}×${shot.height} ${shot.fps.toFixed(2)}fps ${shot.codec}`;
    const length = shot.sequence ? `${shot.frames.length} 帧` : `${Math.round(shot.duration * shot.fps)} 帧`;
    const where = path.relative(project, shot.file).split(path.sep).join('/');
    console.log(`  ${shot.id.padEnd(16)} ${where.padEnd(40)} ${String(length).padEnd(9)} ${shot.duration.toFixed(3)}s  ${spec}  at ${String(shot.clipAt).padEnd(6)} ${shot.action}`);
  }
}

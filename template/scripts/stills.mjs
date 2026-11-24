#!/usr/bin/env node
// Batch stills: render a handful of frames from a composition as PNGs.
//
// Stills are the cheapest way to judge a shot: composition, contrast and text
// wrapping all read correctly at 1:1 in a still, and a batch of eight evenly
// spaced frames catches almost every layout mistake before a full render costs
// you minutes. The default frames are spread across the timeline, not clustered
// at the start.
//
// Usage:
//   node scripts/stills.mjs [compositionId] [--frames 0,45,90] [--out out/stills]
//                           [--scale 1]
//
// Exit codes: 0 = all stills rendered, 1 = at least one failed, 2 = bad arguments.

import {existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const DEFAULT_COMPOSITION = 'Main';
const DEFAULT_OUT = 'out/stills';
const DEFAULT_SCALE = 1;
const STILL_COUNT = 8;

const VALUE_FLAGS = new Set(['frames', 'out', 'scale']);

function printHelp() {
  console.log(`批量渲染静帧（PNG），用于快速检查构图与文字换行。

用法：
  node scripts/stills.mjs [compositionId] [选项]

参数：
  compositionId      合成 id，默认 "${DEFAULT_COMPOSITION}"

选项：
  --frames 0,45,90   指定帧号，逗号分隔（默认按时间轴长度均分 ${STILL_COUNT} 帧）
  --out out/stills   输出目录，默认 ${DEFAULT_OUT}
  --scale 1          缩放比例，默认 ${DEFAULT_SCALE}（0.5 可快速预览）
  -h, --help         显示本帮助

示例：
  node scripts/stills.mjs
  node scripts/stills.mjs Main --frames 0,90,180,270,360
  node scripts/stills.mjs ThreeDemo --out out/three --scale 0.5

输出文件：
  <out>/<compositionId>-frame-<帧号4位>.png
`);
}

function usageError(message) {
  console.error(`✗ ${message}\n`);
  console.error('用法：node scripts/stills.mjs [compositionId] [--frames 0,45,90] [--out out/stills] [--scale 1]');
  console.error('帮助：node scripts/stills.mjs --help');
  process.exit(2);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const equals = arg.indexOf('=');
      const key = (equals === -1 ? arg.slice(2) : arg.slice(2, equals)).toLowerCase();
      if (!VALUE_FLAGS.has(key)) {
        usageError(`未知参数 --${key}`);
      }
      let value;
      if (equals !== -1) {
        value = arg.slice(equals + 1);
      } else {
        value = argv[i + 1];
        if (value === undefined || value.startsWith('-')) {
          usageError(`--${key} 缺少值`);
        }
        i += 1;
      }
      options[key] = value;
      continue;
    }

    if (arg.startsWith('-')) {
      usageError(`未知参数 ${arg}`);
    }

    positionals.push(arg);
  }

  return {positionals, options};
}

/**
 * Spawn a Windows `.cmd` shim through cmd.exe.
 *
 * Node 24 refuses to spawn `.cmd`/`.bat` without `shell: true` (EINVAL), but
 * `shell: true` + an args array is deprecated (DEP0190) because it concatenates
 * arguments. Launching cmd.exe directly keeps the args array safe and quiet.
 */
function spawnShim(command, args, options) {
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec ?? 'cmd.exe';
    return spawnSync(comspec, ['/d', '/s', '/c', command, ...args], options);
  }
  return spawnSync(command, args, options);
}

/** Spawn `npx remotion …` in the project root. */
function runRemotion(args) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return spawnShim(npx, ['remotion', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

/** Turn an absolute path into a CLI-friendly path (relative when inside ROOT). */
function toCliPath(absolute) {
  const relative = path.relative(ROOT, absolute);
  const insideProject =
    relative.length > 0 &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative);
  return insideProject ? relative.split(path.sep).join('/') : absolute;
}

/** Read the timeline length so the default frame spread matches the film. */
async function readDurationInFrames() {
  const file = path.join(ROOT, 'src', 'timeline.ts');
  if (!existsSync(file)) {
    return null;
  }
  try {
    const timeline = await import(pathToFileURL(file).href);
    const duration = Number(timeline.VIDEO?.DURATION ?? timeline.TIMELINE_END);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`  ! 无法读取 src/timeline.ts，跳过自动帧选择（${reason}）`);
    return null;
  }
}

/** Evenly spaced frames across `[0, duration - 1]`, first and last included. */
function evenlySpaced(duration, count) {
  if (duration <= 0) {
    return [0];
  }
  if (duration < count) {
    return Array.from({length: duration}, (_, index) => index);
  }
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    frames.push(Math.round((i * (duration - 1)) / (count - 1)));
  }
  return [...new Set(frames)];
}

/** Parse `0,45,90` into positive integers. */
function parseFrameList(raw) {
  const frames = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (!/^\d+$/.test(trimmed)) {
      usageError(`--frames 里 "${trimmed}" 不是整数帧号（示例：0,45,90）`);
    }
    frames.push(Number.parseInt(trimmed, 10));
  }
  if (frames.length === 0) {
    usageError('--frames 至少需要一个帧号');
  }
  return [...new Set(frames)];
}

function parseScale(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    usageError(`--scale 必须是正数，收到 "${raw}"`);
  }
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const {positionals, options} = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  if (positionals.length > 1) {
    usageError(`最多一个 compositionId，收到：${positionals.join(' ')}`);
  }

  const compositionId = positionals[0] ?? DEFAULT_COMPOSITION;
  if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(compositionId)) {
    usageError(`compositionId "${compositionId}" 不合法（字母开头，允许字母/数字/连字符）`);
  }

  const duration = await readDurationInFrames();

  let frames;
  if (options.frames !== undefined) {
    frames = parseFrameList(options.frames);
  } else if (duration !== null) {
    frames = evenlySpaced(duration, STILL_COUNT);
  } else {
    fail(
      '无法读取 src/timeline.ts 的时长，且没有给 --frames。\n' +
        '  请显式指定帧号，例如：node scripts/stills.mjs Main --frames 0,90,180',
    );
  }

  const outDir = path.resolve(ROOT, options.out ?? DEFAULT_OUT);
  const scale = options.scale === undefined ? DEFAULT_SCALE : parseScale(options.scale);

  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    fail('node_modules 不存在：请先 npm install，再渲染静帧。');
  }

  mkdirSync(outDir, {recursive: true});

  if (duration !== null) {
    const outOfRange = frames.filter((frame) => frame >= duration);
    if (outOfRange.length > 0) {
      console.warn(
        `  ! 以下帧号超出时间轴长度（${duration} 帧）：${outOfRange.join(', ')}；` +
          `若该合成长度不同，渲染可能失败`,
      );
    }
  }

  console.log(
    `▶ 渲染静帧：${compositionId} · ${frames.length} 帧 · ` +
      `输出 ${toCliPath(outDir)}${scale === 1 ? '' : ` · scale ${scale}`}`,
  );

  let succeeded = 0;
  const failures = [];

  for (const [index, frame] of frames.entries()) {
    const label = `[${index + 1}/${frames.length}] frame ${frame}`;
    const fileName = `${compositionId}-frame-${String(frame).padStart(4, '0')}.png`;
    const outputFile = path.join(outDir, fileName);
    const args = ['still', compositionId, toCliPath(outputFile), `--frame=${frame}`];
    if (scale !== 1) {
      args.push(`--scale=${scale}`);
    }

    console.log(`  ${label} → ${toCliPath(outputFile)}`);
    const result = runRemotion(args);

    if (result.error) {
      failures.push({frame, reason: result.error.message});
      console.log(`  ✗ ${label} 启动失败：${result.error.message}`);
      continue;
    }
    if (result.status !== 0) {
      failures.push({frame, reason: `remotion still 退出码 ${result.status}`});
      console.log(`  ✗ ${label} 渲染失败（退出码 ${result.status}）`);
      continue;
    }

    succeeded += 1;
    console.log(`  ✓ ${label}`);
  }

  console.log('');
  if (failures.length > 0) {
    console.log(`✗ 失败：${failures.length}/${frames.length} 帧未生成（成功 ${succeeded} 帧）`);
    for (const failure of failures) {
      console.log(`  ✗ frame ${failure.frame}: ${failure.reason}`);
    }
    process.exit(1);
  }

  console.log(`✓ 全部 ${succeeded} 张静帧已生成：${toCliPath(outDir)}`);
  console.log('  下一步：检查构图与文字换行；确认后再 npm run render:hq');
}

main().catch((error) => {
  console.error(`✗ 静帧渲染失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

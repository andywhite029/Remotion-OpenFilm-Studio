#!/usr/bin/env node
// Render a composition with one of three presets.
//
// The preset is the only decision a render should need. `draft` buys speed for
// layout review, `hq` is the normal delivery encode, `master` trades time for
// a slower x264 pass. All three layer on top of `remotion.config.ts`, which
// already sets h264 / yuv420p, with implicit CRF 18 for CPU encoding.
// --encoder gpu instead uses hardware encoding with target bitrate settings.
//
// After the render the file is reported human-readably. ffprobe is used when
// present; lean ffmpeg builds (and this machine) only ship ffmpeg, so the report
// falls back to parsing `ffmpeg -i`, whose banner carries container, duration,
// bitrate and the stream lines. `ffmpeg -i` exits 1 without an output file —
// that is expected, not a render failure. If neither binary can describe the
// file, the report still prints what is certain (path and size) and never throws.
//
// Usage:
//   node scripts/render.mjs [compositionId] [--preset draft|hq|master]
//                           [--encoder cpu|gpu]
//                           [--frames A-B] [--out out/<id>.mp4] [--concurrency N]
//
// Exit codes: 0 = rendered, 1 = render failed, 2 = bad arguments.

import {existsSync, mkdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const DEFAULT_COMPOSITION = 'Main';
const DEFAULT_PRESET = 'hq';

/**
 * Extra Remotion CLI flags per preset. CRF 18 comes from remotion.config.ts.
 *
 * `master` forces PNG intermediate frames on purpose. JPEG frames make Remotion
 * emit yuvj420p (full-range) whatever the config says, and they soften the
 * edges of white-on-white text — neither matters for a review, both matter for
 * a delivery master.
 */
const PRESETS = {
  draft: ['--scale=0.5', '--crf=28'],
  hq: ['--crf=18'],
  master: ['--crf=14', '--x264-preset=slow', '--image-format=png'],
};

// NVENC does not accept Remotion's CRF / x264 preset settings. These are
// bitrate targets, not quality-equivalent replacements for the CPU presets.
const GPU_PRESETS = {
  draft: ['--scale=0.5', '--video-bitrate=4M'],
  hq: ['--video-bitrate=16M'],
  master: ['--video-bitrate=32M', '--image-format=png'],
};

const VALUE_FLAGS = new Set(['preset', 'frames', 'out', 'concurrency', 'encoder']);

function printHelp() {
  console.log(`用预设参数渲染合成，并报告成片信息。

用法：
  node scripts/render.mjs [compositionId] [选项]

参数：
  compositionId      合成 id，默认 "${DEFAULT_COMPOSITION}"

选项：
  --preset <名字>    draft | hq | master，默认 ${DEFAULT_PRESET}
                     draft  = --scale=0.5 --crf=28   （快速预览）
                     hq     = --crf=18               （常规交付）
                     master = --crf=14 --x264-preset=slow --image-format=png（交付母版）
  --encoder <名字>   cpu | gpu，默认 cpu；gpu 强制硬件编码，失败时不回退
                      GPU 使用目标码率：draft 4M / hq 16M / master 32M
                      GPU master 保留 PNG 中间帧，但不等同于 CPU CRF 14 画质
  --frames A-B       只渲染帧区间（含 A、含 B），例如 --frames 0-120
  --out <路径>       输出文件，默认 out/<compositionId>.mp4
  --concurrency N    并行渲染进程数（默认交给 Remotion 决定）
  -h, --help         显示本帮助

示例：
  npm run render:draft
  node scripts/render.mjs Main --preset hq
  node scripts/render.mjs Main --preset hq --encoder gpu
  node scripts/render.mjs ThreeDemo --frames 0-90 --out out/three.mp4
`);
}

function usageError(message) {
  console.error(`✗ ${message}\n`);
  console.error('用法：node scripts/render.mjs [compositionId] [--preset draft|hq|master] [--encoder cpu|gpu] [--frames A-B] [--out 路径] [--concurrency N]');
  console.error('帮助：node scripts/render.mjs --help');
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

function parseFrames(raw) {
  const match = /^(\d+)-(\d+)$/.exec(raw.trim());
  if (!match) {
    usageError(`--frames 格式应为 A-B，例如 0-120，收到 "${raw}"`);
  }
  const from = Number.parseInt(match[1], 10);
  const to = Number.parseInt(match[2], 10);
  if (from > to) {
    usageError(`--frames 起点 ${from} 大于终点 ${to}`);
  }
  return {from, to, count: to - from + 1, label: `${from}-${to}`};
}

function parseConcurrency(raw) {
  if (!/^\d+$/.test(raw.trim())) {
    usageError(`--concurrency 必须是正整数，收到 "${raw}"`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < 1) {
    usageError('--concurrency 必须大于 0');
  }
  return value;
}

/** Resolve `--out` to a file: a directory argument means `<dir>/<id>.mp4`. */
function resolveOutput(raw, compositionId) {
  if (raw === undefined) {
    return path.join(ROOT, 'out', `${compositionId}.mp4`);
  }
  const absolute = path.resolve(ROOT, raw);
  const asDirectory =
    /[\\/]$/.test(raw) || (existsSync(absolute) && statSync(absolute).isDirectory());
  return asDirectory ? path.join(absolute, `${compositionId}.mp4`) : absolute;
}

/** Absolute path as a CLI-friendly path, relative when inside the project. */
function toCliPath(absolute) {
  const relative = path.relative(ROOT, absolute);
  const insideProject =
    relative.length > 0 &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative);
  return insideProject ? relative.split(path.sep).join('/') : absolute;
}

/** Locate an external binary, honouring `<NAME>_PATH` overrides. */
function findBinary(name) {
  const override = process.env[`${name.toUpperCase()}_PATH`];
  if (override && existsSync(override)) {
    return override;
  }
  const probe = spawnSync(name, ['-version'], {encoding: 'utf8'});
  if (probe.error || probe.status !== 0) {
    return null;
  }
  return name;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function formatDuration(seconds) {
  const whole = Math.floor(seconds);
  const hundredths = Math.round((seconds - whole) * 100);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/** Parse `"30000/1001"` into a numeric fps, or null. */
function parseFrameRate(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }
  const [numerator, denominator] = raw.split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

/** Human fps: integers stay bare, fractional rates keep three decimals. */
function formatFps(fps) {
  return Number.isInteger(fps) ? String(fps) : fps.toFixed(3).replace(/0+$/, '');
}

/** One `Stream #0:0 …: Video: …` banner line, parsed loosely but safely. */
function parseFfmpegVideoLine(line) {
  const video = {};

  const codec = /Video:\s*([A-Za-z0-9_]+)/.exec(line);
  if (codec) {
    video.codec = codec[1];
  }

  const resolution = /,\s*(\d{2,5})x(\d{2,5})/.exec(line);
  if (resolution) {
    video.width = Number(resolution[1]);
    video.height = Number(resolution[2]);
  }

  const fps = /([\d.]+)\s*fps/.exec(line);
  if (fps) {
    video.fps = Number(fps[1]);
  }

  // Pixel formats look like `yuv420p`, `yuv420p10le`, `gray`, `rgba`, `nv12`.
  const pixFmt = /,\s*(yuv[a-z0-9]+|yuva[a-z0-9]+|nv\d+[a-z]*|p0\d+[a-z]*|gbr[a-z0-9]*|rgb[a-z0-9]*|bgr[a-z0-9]*|gray[a-z0-9]*|pal8|monob)\b/i.exec(line);
  if (pixFmt) {
    video.pixFmt = pixFmt[1];
  }

  return Object.keys(video).length > 0 ? video : null;
}

/** One `Stream #0:0 …: Audio: …` banner line. */
function parseFfmpegAudioLine(line) {
  const audio = {};

  const codec = /Audio:\s*([A-Za-z0-9_]+)/.exec(line);
  if (codec) {
    audio.codec = codec[1];
  }

  const sampleRate = /(\d+)\s*Hz/.exec(line);
  if (sampleRate) {
    audio.sampleRate = Number(sampleRate[1]);
  }

  const channels = /(\d+)\s*channels/.exec(line);
  if (channels) {
    audio.channels = Number(channels[1]);
  } else if (/\bstereo\b/.test(line)) {
    audio.channels = 2;
  } else if (/\bmono\b/.test(line)) {
    audio.channels = 1;
  }

  return Object.keys(audio).length > 0 ? audio : null;
}

/**
 * Parse the classic `ffmpeg -i` banner. This is the ffprobe-less fallback and
 * is deliberately best-effort: every field is optional.
 */
function parseFfmpegInfo(stderr) {
  const info = {format: null, duration: null, bitRate: null, video: null, audio: null};

  const input = /Input #0,\s*([^,]+(?:,[^,]+)*?),\s*from\s+'[^']*'/.exec(stderr);
  if (input) {
    info.format = input[1].trim();
  }

  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (duration) {
    info.duration =
      Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  }

  const bitRate = /bitrate:\s*(\d+)\s*kb\/s/.exec(stderr);
  if (bitRate) {
    info.bitRate = Number(bitRate[1]) * 1000;
  }

  for (const line of stderr.split(/\r?\n/)) {
    if (info.video === null && /Stream #\d+:\d+.*: Video:/.test(line)) {
      info.video = parseFfmpegVideoLine(line);
    } else if (info.audio === null && /Stream #\d+:\d+.*: Audio:/.test(line)) {
      info.audio = parseFfmpegAudioLine(line);
    }
  }

  return info;
}

/** Normalise an ffprobe JSON report into the same shape as the ffmpeg fallback. */
function normalizeFfprobe(report) {
  const format = report.format ?? {};
  const streams = Array.isArray(report.streams) ? report.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video') ?? null;
  const audioStream = streams.find((stream) => stream.codec_type === 'audio') ?? null;

  const duration = Number(format.duration);
  const bitRate = Number(format.bit_rate ?? videoStream?.bit_rate);

  return {
    format: format.format_long_name ?? format.format_name ?? null,
    duration: Number.isFinite(duration) ? duration : null,
    bitRate: Number.isFinite(bitRate) ? bitRate : null,
    video: videoStream
      ? {
          codec: videoStream.codec_name ?? null,
          width: Number(videoStream.width) || null,
          height: Number(videoStream.height) || null,
          fps: parseFrameRate(videoStream.r_frame_rate),
          pixFmt: videoStream.pix_fmt ?? null,
          frames: Number(videoStream.nb_frames) || null,
        }
      : null,
    audio: audioStream
      ? {
          codec: audioStream.codec_name ?? null,
          sampleRate: Number(audioStream.sample_rate) || null,
          channels: Number(audioStream.channels) || null,
        }
      : null,
  };
}

/**
 * Describe a rendered file, preferring ffprobe and falling back to `ffmpeg -i`.
 *
 * Never throws: a report is a convenience, not part of the render contract.
 */
function readMediaInfo(file) {
  const size = existsSync(file) ? statSync(file).size : null;

  const ffprobe = findBinary('ffprobe');
  if (ffprobe) {
    const result = spawnSync(
      ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      {encoding: 'utf8'},
    );
    if (!result.error && result.status === 0) {
      try {
        return {...normalizeFfprobe(JSON.parse(result.stdout || '{}')), size, source: 'ffprobe'};
      } catch {
        // Malformed JSON: fall through to the ffmpeg banner.
      }
    }
  }

  const ffmpeg = findBinary('ffmpeg');
  if (!ffmpeg) {
    return {size, source: 'none', format: null, duration: null, bitRate: null, video: null, audio: null};
  }

  const result = spawnSync(ffmpeg, ['-hide_banner', '-i', file], {encoding: 'utf8'});
  const stderr = result.stderr ?? '';
  const info = parseFfmpegInfo(stderr);

  if (info.video !== null || info.audio !== null || info.duration !== null) {
    return {...info, size, source: 'ffmpeg'};
  }

  return {size, source: 'none', parseFailed: true, format: null, duration: null, bitRate: null, video: null, audio: null};
}

/** Print the post-render report. `expectedFrames` comes from `--frames` if given. */
function reportOutput(file, preset, expectedFrames) {
  const absolute = path.resolve(file);
  console.log('');
  console.log(`▶ 渲染完成（preset: ${preset}）`);
  console.log(`  文件: ${toCliPath(absolute)}`);

  if (!existsSync(absolute)) {
    console.log('  ! 输出文件不存在（渲染命令返回成功，请检查 --out 路径）');
    return;
  }

  const info = readMediaInfo(absolute);

  if (info.size !== null) {
    console.log(`  大小: ${formatBytes(info.size)}`);
  }

  if (info.source === 'none') {
    if (info.parseFailed) {
      console.log('  ! 无法解析媒体信息（ffprobe 缺失且 ffmpeg 输出不可识别），仅报告文件大小');
    } else {
      console.log('  ! 未找到 ffprobe / ffmpeg，跳过时长与流信息（可运行 npm run doctor 检查环境）');
    }
    if (expectedFrames !== null) {
      console.log(`  帧数: ${expectedFrames}（来自 --frames）`);
    }
    return;
  }

  if (info.source === 'ffmpeg') {
    console.log('  ! 未检测到 ffprobe，已用 ffmpeg -i 兜底解析');
  }

  if (info.duration !== null) {
    console.log(`  时长: ${info.duration.toFixed(2)} s（${formatDuration(info.duration)}）`);
  }

  if (info.video !== null) {
    const resolution =
      info.video.width !== undefined && info.video.height !== undefined
        ? `${info.video.width}x${info.video.height}`
        : '未知';
    const fps = typeof info.video.fps === 'number' ? ` @ ${formatFps(info.video.fps)}fps` : '';
    const codec = info.video.codec ? ` · ${info.video.codec}` : '';
    const pixFmt = info.video.pixFmt ? ` · ${info.video.pixFmt}` : '';
    console.log(`  分辨率: ${resolution}${fps}${codec}${pixFmt}`);

    let frames = info.video.frames;
    let estimated = false;
    if (frames === null || frames === undefined) {
      if (info.duration !== null && typeof info.video.fps === 'number') {
        frames = Math.round(info.duration * info.video.fps);
        estimated = true;
      } else if (expectedFrames !== null) {
        frames = expectedFrames;
        estimated = false;
      }
    }
    if (frames !== null && frames !== undefined) {
      console.log(`  帧数: ${estimated ? '≈' : ''}${frames}`);
    }
  } else {
    console.log('  ! 未发现视频流');
    if (expectedFrames !== null) {
      console.log(`  帧数: ${expectedFrames}（来自 --frames）`);
    }
  }

  if (info.audio !== null) {
    console.log(
      `  音频: ${info.audio.codec ?? '未知'}` +
        `${info.audio.sampleRate ? ` · ${info.audio.sampleRate}Hz` : ''}` +
        `${info.audio.channels ? ` · ${info.audio.channels} 声道` : ''}`,
    );
  }

  if (info.bitRate !== null) {
    console.log(`  码率: ${(info.bitRate / 1_000_000).toFixed(2)} Mbps`);
  }
}

async function main() {
  const {positionals, options} = parseArgs(process.argv.slice(2));

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

  const preset = (options.preset ?? DEFAULT_PRESET).toLowerCase();
  if (!Object.hasOwn(PRESETS, preset)) {
    usageError(`--preset 只能是 draft / hq / master，收到 "${options.preset}"`);
  }

  const encoder = (options.encoder ?? 'cpu').toLowerCase();
  if (encoder !== 'cpu' && encoder !== 'gpu') {
    usageError(`--encoder 只能是 cpu / gpu，收到 "${options.encoder}"`);
  }

  const frames = options.frames === undefined ? null : parseFrames(options.frames);
  const concurrency =
    options.concurrency === undefined ? null : parseConcurrency(options.concurrency);
  const outputFile = resolveOutput(options.out, compositionId);

  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    fail('node_modules 不存在：请先 npm install，再渲染。');
  }

  mkdirSync(path.dirname(outputFile), {recursive: true});

  const cliArgs = [
    'render',
    compositionId,
    toCliPath(outputFile),
    ...(encoder === 'gpu' ? GPU_PRESETS[preset] : PRESETS[preset]),
    `--hardware-acceleration=${encoder === 'gpu' ? 'required' : 'disable'}`,
  ];
  if (frames !== null) {
    cliArgs.push(`--frames=${frames.label}`);
  }
  if (concurrency !== null) {
    cliArgs.push(`--concurrency=${concurrency}`);
  }

  console.log(`▶ 渲染 ${compositionId} · preset ${preset} · encoder ${encoder}`);
  console.log(`  npx remotion ${cliArgs.join(' ')}`);

  // Preload before the CLI imports renderer internals. Direct Node invocation also
  // preserves spaces and Chinese paths without a Windows cmd.exe shim.
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve('@remotion/cli/package.json')), 'remotion-cli.js');
  const result = spawnSync(process.execPath, [
    '--import', pathToFileURL(path.join(HERE, 'local-public-assets.mjs')).href, cli, ...cliArgs,
  ], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (result.error) {
    fail(`启动 remotion 失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`remotion render 失败（退出码 ${result.status}）`);
  }

  reportOutput(outputFile, preset, frames === null ? null : frames.count);
}

main().catch((error) => {
  console.error(`✗ 渲染失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

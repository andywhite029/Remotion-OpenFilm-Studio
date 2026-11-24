#!/usr/bin/env node
// ffmpeg toolbox for the asset pipeline.
//
// The template deliberately ships no footage: everything under `public/` is
// produced from source material with these commands, so the pipeline is
// reproducible instead of "some file someone exported once". ffmpeg is not a
// dependency of the project — it is a system tool, checked by scripts/doctor.mjs.
//
// Commands:
//   probe <file>                                 inspect a media file
//   from-video <in> --out <dir> --fps N          video -> PNG sequence (%04d.png)
//   retime <in> <out> --speed S                  slow / fast motion, frame count aware
//   to-gif <in> <out>                            high quality GIF (palettegen pass)
//   mux-audio <video> <audio> <out>              attach an audio track (video copied)
//   contact-sheet <dir> <out.jpg>                image sequence -> contact sheet
//
// Every subcommand supports `--help`. Exit codes: 0 = done, 1 = ffmpeg missing
// or failed, 2 = bad arguments.

import {existsSync, mkdirSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const IMAGE_SEQUENCE = /%\d*d/;
const VIDEO_TARGET = /\.(mp4|mov|mkv|webm|m4v)$/i;
const IMAGE_TARGET = /\.(png|jpe?g|webp)$/i;
const SEQUENCE_FILE = /^(\d{4,})\.(png|jpe?g)$/i;

const INSTALL_HINT = `  安装（任选其一）：
    winget install --id Gyan.FFmpeg -e
    choco install ffmpeg
  或从 https://www.gyan.dev/ffmpeg/builds/ 下载后把 bin 目录加入 PATH。
  已安装但找不到时，设置环境变量 FFMPEG_PATH / FFPROBE_PATH 指向可执行文件。`;

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

function usageError(message, usage) {
  console.error(`✗ ${message}\n`);
  console.error(`用法：${usage}`);
  console.error('帮助：node scripts/media.mjs --help');
  process.exit(2);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
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

function requireBinary(name) {
  const found = findBinary(name);
  if (!found) {
    console.error(`✗ 未找到 ${name}：该子命令需要系统安装的 ffmpeg / ffprobe。`);
    console.error(INSTALL_HINT);
    process.exit(1);
  }
  return found;
}

function runFfmpeg(args) {
  const bin = requireBinary('ffmpeg');
  // `-loglevel error` on purpose: x264 prints a screenful of encoder statistics
  // at info level, and since this helper inherits stdio the user would see it.
  // Each subcommand prints its own summary; a wall of codec stats reads as a
  // failure to anyone who is not an ffmpeg user.
  const result = spawnSync(bin, ['-loglevel', 'error', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) {
    fail(`启动 ffmpeg 失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`ffmpeg 执行失败（退出码 ${result.status}）`);
  }
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) {
    return '未知';
  }
  const total = Math.round(seconds * 100) / 100;
  if (total < 60) {
    return `${total.toFixed(2)} s`;
  }
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total - minutes * 60).toFixed(2).padStart(5, '0')}`;
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

function toCliPath(absolute) {
  const relative = path.relative(ROOT, absolute);
  const insideProject =
    relative.length > 0 &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative);
  return insideProject ? relative.split(path.sep).join('/') : absolute;
}

function resolvePath(raw) {
  return path.resolve(ROOT, raw);
}

function ensureParent(absolute) {
  mkdirSync(path.dirname(absolute), {recursive: true});
}

function requireExistingFile(raw) {
  const absolute = resolvePath(raw);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    fail(`输入文件不存在：${raw}`);
  }
  return absolute;
}

/** Numeric flag: finite and strictly positive. */
function positiveNumber(name, raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    usageError(`--${name} 必须是正数，收到 "${raw}"`, '见 --help');
  }
  return value;
}

/** Count the numbered image files in a sequence directory. */
function countSequenceFrames(dir) {
  if (!existsSync(dir)) {
    return 0;
  }
  return readdirSync(dir).filter((name) => SEQUENCE_FILE.test(name)).length;
}

/** List a directory of numbered images, sorted by number. */
function listSequenceFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => SEQUENCE_FILE.test(name))
    .map((name) => ({
      name,
      index: Number.parseInt(SEQUENCE_FILE.exec(name)[1], 10),
    }))
    .sort((a, b) => a.index - b.index);
}

/** Generic `--flag value` / `--flag=value` parser. Returns positionals + flags. */
function parseArgs(argv, valueFlags, usage) {
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
      if (!valueFlags.includes(key)) {
        usageError(`未知参数 --${key}`, usage);
      }
      let value;
      if (equals !== -1) {
        value = arg.slice(equals + 1);
      } else {
        value = argv[i + 1];
        if (value === undefined || value.startsWith('-')) {
          usageError(`--${key} 缺少值`, usage);
        }
        i += 1;
      }
      options[key] = value;
      continue;
    }

    if (arg.startsWith('-')) {
      usageError(`未知参数 ${arg}`, usage);
    }

    positionals.push(arg);
  }

  return {positionals, options};
}

// ---------------------------------------------------------------------------
// probe
// ---------------------------------------------------------------------------

const PROBE_USAGE = 'node scripts/media.mjs probe <file>';

function probeHelp() {
  console.log(`查看媒体的容器、时长、码率与音视频流信息。

ffprobe 存在时优先用它；没有 ffprobe 时自动退化为解析 \`ffmpeg -i\` 的输出。
（\`ffmpeg -i\` 在没有输出文件时退出码为 1，这是正常现象，不会判为失败。）

用法：
  ${PROBE_USAGE}

示例：
  node scripts/media.mjs probe out/Main.mp4
  node scripts/media.mjs probe public/media/source.mp4
`);
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

/** Parse the classic `ffmpeg -i` banner; every field is optional. */
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

/** Describe a file: ffprobe first, then the `ffmpeg -i` banner. */
function probeFile(file) {
  const size = statSync(file).size;
  const ffprobe = findBinary('ffprobe');

  if (ffprobe) {
    const result = spawnSync(
      ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      {cwd: ROOT, encoding: 'utf8'},
    );
    if (!result.error && result.status === 0) {
      try {
        return {
          ...normalizeFfprobe(JSON.parse(result.stdout || '{}')),
          size,
          source: 'ffprobe',
          rawStderr: null,
        };
      } catch {
        // Malformed JSON: fall through to the ffmpeg banner.
      }
    }
  }

  const ffmpeg = findBinary('ffmpeg');
  if (!ffmpeg) {
    console.error('✗ 未找到 ffprobe 与 ffmpeg：probe 需要至少安装其中一个。');
    console.error(INSTALL_HINT);
    process.exit(1);
  }

  const result = spawnSync(ffmpeg, ['-hide_banner', '-i', file], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  // No output file was requested, so exit code 1 is the expected outcome here.
  const stderr = result.stderr ?? '';
  const info = parseFfmpegInfo(stderr);

  if (info.video === null && info.audio === null && info.duration === null) {
    console.error('✗ 无法解析 ffmpeg -i 的输出，probe 失败。原始输出：');
    console.error(stderr.trim());
    process.exit(1);
  }

  return {...info, size, source: 'ffmpeg', rawStderr: stderr};
}

function cmdProbe(argv) {
  const {positionals, options} = parseArgs(argv, [], PROBE_USAGE);
  if (options.help) {
    probeHelp();
    return;
  }
  if (positionals.length !== 1) {
    usageError('probe 需要且只需要一个文件路径', PROBE_USAGE);
  }

  const file = requireExistingFile(positionals[0]);
  const info = probeFile(file);

  console.log(`▶ 媒体信息：${toCliPath(file)}`);
  console.log(`  容器: ${info.format ?? '未知'}`);
  console.log(`  大小: ${formatBytes(info.size)}`);
  if (info.duration !== null) {
    console.log(`  时长: ${formatSeconds(info.duration)}`);
  }
  if (info.bitRate !== null) {
    console.log(`  总码率: ${(info.bitRate / 1_000_000).toFixed(2)} Mbps`);
  }

  if (info.video === null && info.audio === null) {
    console.log('  ! 未发现音视频流');
  }

  if (info.video !== null) {
    const resolution =
      info.video.width !== undefined && info.video.height !== undefined
        ? `${info.video.width}x${info.video.height}`
        : '未知';
    const fps = typeof info.video.fps === 'number' ? ` @ ${formatFps(info.video.fps)}fps` : '';
    console.log(
      `  视频: ${info.video.codec ?? '未知'} ${resolution}${fps}` +
        `${info.video.pixFmt ? ` · ${info.video.pixFmt}` : ''}` +
        `${info.video.frames ? ` · ${info.video.frames} 帧` : ''}`,
    );
  }

  if (info.audio !== null) {
    console.log(
      `  音频: ${info.audio.codec ?? '未知'}` +
        `${info.audio.sampleRate ? ` · ${info.audio.sampleRate}Hz` : ''}` +
        `${info.audio.channels ? ` · ${info.audio.channels} 声道` : ''}`,
    );
  }

  if (info.source === 'ffmpeg') {
    console.log('  ! 未检测到 ffprobe，已用 ffmpeg -i 兜底（原始输出如下）：');
    // `ffmpeg -i` with no output file exits 1 and appends this line; it is an
    // artefact of using it as a probe, not a problem with the file.
    const noise = /^\s*At least one output file must be specified\s*$/;
    for (const line of info.rawStderr.trim().split(/\r?\n/)) {
      if (noise.test(line)) continue;
      console.log(`    ${line}`);
    }
  }
}

// ---------------------------------------------------------------------------
// from-video
// ---------------------------------------------------------------------------

const FROM_VIDEO_USAGE =
  'node scripts/media.mjs from-video <in> --out <dir> --fps N [--start s] [--scale W]';

function fromVideoHelp() {
  console.log(`把视频切成 PNG 序列，供 <Img> 逐帧播放或 remotion still 取帧。

用法：
  ${FROM_VIDEO_USAGE}

选项：
  --out <dir>    输出目录（自动创建），文件命名为 %04d.png
  --fps N        抽帧帧率，例如 30
  --start s      从第几秒开始（可选，默认从头）
  --scale W      缩放到指定宽度，高度按比例（-2 保证偶数，可选）

示例：
  node scripts/media.mjs from-video public/media/source.mp4 --out public/media/frames --fps 30
  node scripts/media.mjs from-video in.mp4 --out out/frames --fps 30 --start 2.5 --scale 1280
`);
}

function cmdFromVideo(argv) {
  const {positionals, options} = parseArgs(
    argv,
    ['out', 'fps', 'start', 'scale'],
    FROM_VIDEO_USAGE,
  );
  if (options.help) {
    fromVideoHelp();
    return;
  }
  if (positionals.length !== 1) {
    usageError('from-video 需要一个输入视频', FROM_VIDEO_USAGE);
  }
  if (options.out === undefined) {
    usageError('缺少 --out <dir>', FROM_VIDEO_USAGE);
  }
  if (options.fps === undefined) {
    usageError('缺少 --fps N', FROM_VIDEO_USAGE);
  }

  const input = requireExistingFile(positionals[0]);
  const outDir = resolvePath(options.out);
  const fps = positiveNumber('fps', options.fps);
  const start = options.start === undefined ? null : positiveNumber('start', options.start);
  const scale = options.scale === undefined ? null : positiveNumber('scale', options.scale);
  const scaleWidth = scale === null ? null : Math.round(scale);

  mkdirSync(outDir, {recursive: true});

  const filters = [`fps=${fps}`];
  if (scaleWidth !== null) {
    filters.push(`scale=${scaleWidth}:-2`);
  }

  const pattern = path.join(outDir, '%04d.png');
  const args = ['-y', '-hide_banner'];
  if (start !== null) {
    args.push('-ss', String(start));
  }
  args.push('-i', input, '-vf', filters.join(','), '-start_number', '1', pattern);

  console.log(`▶ 导出 PNG 序列：${toCliPath(input)} → ${toCliPath(pattern)} · ${fps}fps`);
  runFfmpeg(args);

  const count = countSequenceFrames(outDir);
  console.log(`✓ 已导出 ${count} 帧 PNG（${toCliPath(outDir)}）`);
  console.log('  下一步：在组件里用 <Img src={staticFile(`media/frames/0001.png`)} /> 序列化播放');
}

// ---------------------------------------------------------------------------
// retime
// ---------------------------------------------------------------------------

const RETIME_USAGE = 'node scripts/media.mjs retime <in> <out> --speed S [--fps N]';

function retimeHelp() {
  console.log(`重定时：慢放 / 快放，帧数感知。

- 视频 → 视频：帧数不变，时长按 1/speed 变化（慢动作）。
- 图片序列 → 图片序列：用 fps 滤镜补/抽帧，帧数约为 输入帧数 / speed，
  这是 "96 帧拉成 178 帧" 的做法（speed ≈ 0.54）。
  图片序列没有帧率元信息，所以输入/输出帧率都用 --fps（默认 30）解释。

用法：
  ${RETIME_USAGE}

选项：
  --speed S      播放速度倍率，> 0；0.5 = 半速（时长 ×2），2 = 双速
  --fps N        序列的帧率（输入按它读取、输出按它重采样），默认 30
  -h, --help     显示本帮助

音频：本命令只处理画面，音轨会被丢弃（合音请用 mux-audio）。

示例：
  node scripts/media.mjs retime in/%04d.png out/%04d.png --speed 0.54
  node scripts/media.mjs retime clip.mp4 clip-slow.mp4 --speed 0.5
`);
}

function cmdRetime(argv) {
  const {positionals, options} = parseArgs(argv, ['speed', 'fps'], RETIME_USAGE);
  if (options.help) {
    retimeHelp();
    return;
  }
  if (positionals.length !== 2) {
    usageError('retime 需要输入与输出两个路径', RETIME_USAGE);
  }
  if (options.speed === undefined) {
    usageError('缺少 --speed S', RETIME_USAGE);
  }

  const inputRaw = positionals[0];
  const outputRaw = positionals[1];
  const speed = positiveNumber('speed', options.speed);
  const inputIsSequence = IMAGE_SEQUENCE.test(inputRaw);
  const outputIsSequence = IMAGE_SEQUENCE.test(outputRaw);
  const input = inputIsSequence ? resolvePath(inputRaw) : requireExistingFile(inputRaw);
  const output = resolvePath(outputRaw);
  ensureParent(output);

  // Image sequences carry no frame-rate metadata; interpret them at `--fps`
  // (default 30) so that one input frame becomes exactly 1/speed output frames.
  const sequenceFps =
    options.fps === undefined ? 30 : positiveNumber('fps', options.fps);

  const filters = [`setpts=PTS/${speed}`];

  if (outputIsSequence || options.fps !== undefined) {
    filters.push(`fps=${sequenceFps}`);
  } else if (VIDEO_TARGET.test(outputRaw)) {
    // Slow motion on video: re-encode, drop audio, keep player-compatible pixels.
    filters.push('format=yuv420p');
  } else if (!IMAGE_TARGET.test(outputRaw)) {
    console.warn('  ! 输出扩展名未识别，按普通视频处理');
  }

  const args = ['-y', '-hide_banner'];
  if (inputIsSequence) {
    // Must precede -i: it is an option of the image2 demuxer.
    args.push('-framerate', String(sequenceFps));
  }
  args.push('-i', input, '-vf', filters.join(','), '-an');

  if (VIDEO_TARGET.test(outputRaw)) {
    args.push('-c:v', 'libx264', '-crf', '18');
  }
  args.push(output);

  if (inputIsSequence && outputIsSequence) {
    const inputFrames = countSequenceFrames(path.dirname(input));
    if (inputFrames > 0) {
      const estimate = Math.round(inputFrames / speed);
      console.log(
        `  输入序列 ${inputFrames} 帧 → 预计输出约 ${estimate} 帧（speed ${speed}，${sequenceFps}fps）`,
      );
    }
  }

  console.log(`▶ 重定时：${toCliPath(input)} → ${toCliPath(output)} · speed ${speed}`);
  runFfmpeg(args);
  console.log(`✓ 完成：${toCliPath(output)}`);
}

// ---------------------------------------------------------------------------
// to-gif
// ---------------------------------------------------------------------------

const TO_GIF_USAGE =
  'node scripts/media.mjs to-gif <in> <out> [--fps N] [--width W] [--start s] [--duration s]';

function toGifHelp() {
  console.log(`生成高质量 GIF（palettegen/paletteuse 两遍调色板法）。

用法：
  ${TO_GIF_USAGE}

选项：
  --fps N         帧率，默认 15（GIF 体积与流畅度的平衡点）
  --width W       宽度，默认 640，高度按比例
  --start s       起始秒
  --duration s    截取时长（秒）

示例：
  node scripts/media.mjs to-gif out/Main.mp4 out/preview.gif
  node scripts/media.mjs to-gif out/Main.mp4 out/preview.gif --fps 12 --width 480 --duration 5
`);
}

function cmdToGif(argv) {
  const {positionals, options} = parseArgs(
    argv,
    ['fps', 'width', 'start', 'duration'],
    TO_GIF_USAGE,
  );
  if (options.help) {
    toGifHelp();
    return;
  }
  if (positionals.length !== 2) {
    usageError('to-gif 需要输入与输出两个路径', TO_GIF_USAGE);
  }

  const input = requireExistingFile(positionals[0]);
  const output = resolvePath(positionals[1]);
  ensureParent(output);

  const fps = options.fps === undefined ? 15 : positiveNumber('fps', options.fps);
  const width = options.width === undefined ? 640 : Math.round(positiveNumber('width', options.width));
  const start = options.start === undefined ? null : positiveNumber('start', options.start);
  const duration =
    options.duration === undefined ? null : positiveNumber('duration', options.duration);

  const chain = [`fps=${fps}`, `scale=${width}:-1:flags=lanczos`];
  const filter = `${chain.join(',')},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`;

  const args = ['-y', '-hide_banner'];
  if (start !== null) {
    args.push('-ss', String(start));
  }
  if (duration !== null) {
    args.push('-t', String(duration));
  }
  args.push('-i', input, '-filter_complex', filter, '-loop', '0', output);

  console.log(`▶ 生成 GIF：${toCliPath(input)} → ${toCliPath(output)} · ${fps}fps · ${width}px`);
  runFfmpeg(args);
  console.log(`✓ 完成：${toCliPath(output)}（${formatBytes(statSync(output).size)}）`);
}

// ---------------------------------------------------------------------------
// mux-audio
// ---------------------------------------------------------------------------

const MUX_USAGE = 'node scripts/media.mjs mux-audio <video> <audio> <out>';

function muxHelp() {
  console.log(`把音轨合进视频：视频流直接复制（不重编码），音轨转 AAC。

用法：
  ${MUX_USAGE}

参数：
  <video>   视频文件
  <audio>   音频文件（mp3 / wav / m4a …）
  <out>     输出视频（mp4）

示例：
  node scripts/media.mjs mux-audio out/Main.mp4 public/audio/theme.mp3 out/Main-scored.mp4
`);
}

function cmdMuxAudio(argv) {
  const {positionals, options} = parseArgs(argv, [], MUX_USAGE);
  if (options.help) {
    muxHelp();
    return;
  }
  if (positionals.length !== 3) {
    usageError('mux-audio 需要视频、音频、输出三个路径', MUX_USAGE);
  }

  const video = requireExistingFile(positionals[0]);
  const audio = requireExistingFile(positionals[1]);
  const output = resolvePath(positionals[2]);
  ensureParent(output);

  console.log(`▶ 合并音轨：${toCliPath(video)} + ${toCliPath(audio)} → ${toCliPath(output)}`);
  runFfmpeg([
    '-y',
    '-hide_banner',
    '-i',
    video,
    '-i',
    audio,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    output,
  ]);
  console.log(`✓ 完成：${toCliPath(output)}（${formatBytes(statSync(output).size)}）`);
}

// ---------------------------------------------------------------------------
// contact-sheet
// ---------------------------------------------------------------------------

const CONTACT_SHEET_USAGE = 'node scripts/media.mjs contact-sheet <dir> <out.jpg> [--cols N] [--max N]';

function contactSheetHelp() {
  console.log(`把图片序列拼成一张联系表（缩略图网格），用来快速扫一遍素材。

用法：
  ${CONTACT_SHEET_USAGE}

选项：
  --cols N       每行列数，默认 5
  --max N        最多取多少帧，默认 20（超出时自动等间隔抽帧）
  --thumb W      缩略图宽度，默认 320

示例：
  node scripts/media.mjs contact-sheet public/media/frames out/contact.jpg
  node scripts/media.mjs contact-sheet public/media/frames out/contact.jpg --cols 4 --max 16
`);
}

function cmdContactSheet(argv) {
  const {positionals, options} = parseArgs(
    argv,
    ['cols', 'max', 'thumb'],
    CONTACT_SHEET_USAGE,
  );
  if (options.help) {
    contactSheetHelp();
    return;
  }
  if (positionals.length !== 2) {
    usageError('contact-sheet 需要输入目录与输出图片两个路径', CONTACT_SHEET_USAGE);
  }

  const dir = resolvePath(positionals[0]);
  const output = resolvePath(positionals[1]);
  ensureParent(output);

  const files = listSequenceFiles(dir);
  if (files.length === 0) {
    fail(
      `目录里没有编号图片：${toCliPath(dir)}\n` +
        '  请先用 from-video 导出 %04d.png 序列，或把帧命名为 0001.png 起。',
    );
  }

  const cols = options.cols === undefined ? 5 : Math.max(1, Math.round(positiveNumber('cols', options.cols)));
  const maxTiles =
    options.max === undefined ? 20 : Math.max(1, Math.round(positiveNumber('max', options.max)));
  const thumb = options.thumb === undefined ? 320 : Math.round(positiveNumber('thumb', options.thumb));

  const step = Math.max(1, Math.ceil(files.length / maxTiles));
  const selected = Math.ceil(files.length / step);
  const gridCols = Math.min(cols, selected);
  const gridRows = Math.ceil(selected / gridCols);
  const startNumber = files[0].index;

  // `\,` escapes the comma inside mod() for the filtergraph parser.
  const filter =
    `select=not(mod(n\\,${step})),` +
    `scale=${thumb}:-2,` +
    `tile=${gridCols}x${gridRows}:nb_frames=${selected}:margin=8:padding=4:color=0x101014`;

  const args = [
    '-y',
    '-hide_banner',
    '-start_number',
    String(startNumber),
    '-i',
    path.join(dir, '%04d.png'),
    '-vf',
    filter,
    '-frames:v',
    '1',
    // A single still with no `%d` pattern needs this, or ffmpeg warns.
    '-update',
    '1',
    output,
  ];

  console.log(
    `▶ 联系表：${toCliPath(dir)}（${files.length} 帧，每 ${step} 帧取 1 → ${selected} 格）` +
      ` → ${toCliPath(output)}`,
  );
  runFfmpeg(args);
  console.log(`✓ 完成：${toCliPath(output)}（${formatBytes(statSync(output).size)}）`);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`ffmpeg 媒体工具集（需要系统安装 ffmpeg / ffprobe）。

用法：
  node scripts/media.mjs <子命令> [参数...]

子命令：
  probe <file>                                     查看媒体信息
  from-video <in> --out <dir> --fps N              视频 → PNG 序列（%04d.png）
  retime <in> <out> --speed S                      重定时（慢放/快放，帧数感知）
  to-gif <in> <out>                                高质量 GIF（调色板两遍法）
  mux-audio <video> <audio> <out>                  合入音轨（视频流复制）
  contact-sheet <dir> <out.jpg>                    图片序列 → 联系表

每个子命令都支持 --help：
  node scripts/media.mjs from-video --help
`);
}

const SUBCOMMANDS = new Map([
  ['probe', cmdProbe],
  ['from-video', cmdFromVideo],
  ['retime', cmdRetime],
  ['to-gif', cmdToGif],
  ['mux-audio', cmdMuxAudio],
  ['contact-sheet', cmdContactSheet],
]);

function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printHelp();
    process.exit(2);
  }

  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    printHelp();
    return;
  }

  const subcommand = argv[0];
  const handler = SUBCOMMANDS.get(subcommand);

  if (!handler) {
    console.error(`✗ 未知子命令 "${subcommand}"\n`);
    printHelp();
    process.exit(2);
  }

  handler(argv.slice(1));
}

main();

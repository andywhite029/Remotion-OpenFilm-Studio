#!/usr/bin/env node
// Environment doctor: the one command to run when a render fails for reasons
// that are not in the code.
//
// It checks the machine (node, npm, ffmpeg/ffprobe, disk, ports), the install
// (node_modules, the three Remotion packages being on the *same* version) and
// the project skeleton (entry points, registry markers, and that the data files
// load through Node's native type stripping — which is what `node tools/*.ts`
// relies on).
//
// Output is graded: PASS = fine, WARN = optional or worth knowing, FAIL = fix
// this before rendering. Exit code is 1 when anything FAILs.
//
// Usage: node scripts/doctor.mjs [--help]

import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, writeFileSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** Packages that must agree exactly: Remotion breaks across minor drift. */
const REMOTION_PACKAGES = ['remotion', '@remotion/cli', '@remotion/three'];

/** The skeleton files the tooling and the renderer both rely on. */
const REQUIRED_FILES = [
  'src/index.ts',
  'src/Root.tsx',
  'src/compositions.ts',
  'src/timeline.ts',
  'src/theme.ts',
  'src/sequences/Main.tsx',
];

const STUDIO_PORTS = [3000, 3001];

const MIN_NODE_MAJOR = 22;
const MIN_FREE_BYTES = 2 * 1024 ** 3;
const COMFORTABLE_FREE_BYTES = 10 * 1024 ** 3;

const REGISTRY_MARKERS = ['// @new-composition-import', '// @new-composition'];

const results = [];

function record(level, label, message) {
  results.push({level, label});
  const tag = level === 'pass' ? 'PASS' : level === 'warn' ? 'WARN' : 'FAIL';
  console.log(`  [${tag}] ${label.padEnd(16)} ${message}`);
}

function pass(label, message) {
  record('pass', label, message);
}

function warn(label, message) {
  record('warn', label, message);
}

function fail(label, message) {
  record('fail', label, message);
}

function printHelp() {
  console.log(`环境自检：机器 / 依赖 / 项目骨架 / 端口 / 磁盘。

用法：
  node scripts/doctor.mjs

输出分级：
  PASS  正常
  WARN  可选组件缺失或值得注意，不阻塞
  FAIL  必须修复（有 FAIL 时退出码为 1）

示例：
  npm run doctor
`);
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

function firstLine(text) {
  return (text ?? '').split(/\r?\n/)[0].trim();
}

/** Version string of an installed package, or null when absent. */
function installedVersion(packageName) {
  const file = path.join(ROOT, 'node_modules', ...packageName.split('/'), 'package.json');
  if (!existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8')).version ?? null;
  } catch {
    return null;
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
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Free bytes on the volume that holds the project, or null when unknown. */
function freeDiskBytes() {
  try {
    const stats = statfsSync(ROOT);
    const free = Number(stats.bavail) * Number(stats.bsize);
    if (Number.isFinite(free) && free > 0) {
      return free;
    }
  } catch {
    // fs.statfs is not implemented on every Windows build; fall through.
  }

  if (process.platform === 'win32') {
    const drive = path.parse(ROOT).root.replace(/[\\/]+$/, '');
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-PSDrive -Name '${drive.slice(0, 1)}').Free`,
      ],
      {encoding: 'utf8'},
    );
    const parsed = Number((result.stdout ?? '').trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

/** True when nothing is listening on `port` on localhost. */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    const finish = (free) => {
      server.removeAllListeners();
      resolve(free);
    };
    server.once('error', () => finish(false));
    server.once('listening', () => server.close(() => finish(true)));
    server.listen({port, host: '127.0.0.1', exclusive: true});
  });
}

// ---------------------------------------------------------------------------
// Checks.
// ---------------------------------------------------------------------------

function checkNode() {
  const raw = process.versions.node;
  const major = Number.parseInt(raw.split('.')[0], 10);

  if (major < MIN_NODE_MAJOR) {
    fail('Node.js', `v${raw} 过低，需要 >= ${MIN_NODE_MAJOR}（见 package.json engines）`);
    return;
  }

  if (major >= 23) {
    pass('Node.js', `v${raw}（原生 TypeScript 类型剥离可用，node tools/*.ts 可直接运行）`);
  } else if (Number.parseInt(raw.split('.')[1] ?? '0', 10) >= 6) {
    warn('Node.js', `v${raw}（可直接跑 .ts 需要 --experimental-strip-types；建议升级到 Node 24）`);
  } else {
    warn('Node.js', `v${raw} 低于 22.6，node tools/*.ts 无法直接运行；请升级到 Node 24 LTS`);
  }
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

function checkNpm() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnShim(npm, ['--version'], {encoding: 'utf8'});
  if (result.error || result.status !== 0) {
    fail('npm', '未找到 npm（渲染与依赖安装都需要它）');
    return;
  }
  pass('npm', result.stdout.trim());
}

function checkFfmpeg() {
  // ffmpeg is the actual media toolchain: without it scripts/media.mjs cannot
  // run at all, so that is a FAIL. ffprobe is only the nicer reporting path —
  // render.mjs and media.mjs fall back to parsing `ffmpeg -i`, so a missing
  // ffprobe is a WARN and never blocks a render.
  const ffmpeg = findBinary('ffmpeg');
  if (!ffmpeg) {
    fail(
      'ffmpeg',
      '未找到 —— 媒体工具链不可用（scripts/media.mjs 无法运行）；' +
        '安装：winget install --id Gyan.FFmpeg -e',
    );
  } else {
    const result = spawnSync(ffmpeg, ['-version'], {encoding: 'utf8'});
    pass('ffmpeg', firstLine(result.stdout) || '已安装');
  }

  const ffprobe = findBinary('ffprobe');
  if (!ffprobe) {
    warn(
      'ffprobe',
      '未找到 —— probe 会退化为 ffmpeg -i，不影响渲染',
    );
    return;
  }
  const result = spawnSync(ffprobe, ['-version'], {encoding: 'utf8'});
  pass('ffprobe', firstLine(result.stdout) || '已安装');
}

function checkTypeScript() {
  const version = installedVersion('typescript');
  if (version) {
    pass('TypeScript', version);
  } else {
    warn('TypeScript', '未安装或无法解析（npm install 后可用 npm run typecheck）');
  }
}

function checkDependencies() {
  const nodeModules = path.join(ROOT, 'node_modules');
  if (!existsSync(nodeModules)) {
    fail('node_modules', '不存在 —— 请先运行 npm install');
    return;
  }
  pass('node_modules', '已安装');

  const versions = REMOTION_PACKAGES.map((name) => ({
    name,
    version: installedVersion(name),
  }));
  const missing = versions.filter((entry) => entry.version === null);

  if (missing.length > 0) {
    fail(
      'Remotion 版本',
      `缺少安装：${missing.map((entry) => entry.name).join(', ')} —— 重新 npm install`,
    );
    return;
  }

  const unique = new Set(versions.map((entry) => entry.version));
  if (unique.size !== 1) {
    fail(
      'Remotion 版本',
      `三个包版本不一致：${versions.map((entry) => `${entry.name}@${entry.version}`).join('、')}；` +
        '请把它们固定到同一个版本',
    );
    return;
  }

  pass(
    'Remotion 版本',
    `${versions.map((entry) => entry.name).join(' / ')} 均为 ${versions[0].version}`,
  );

  // Declared vs installed: a lockfile drift is worth knowing, not fatal.
  try {
    const declared = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const declaredDeps = {...declared.dependencies, ...declared.devDependencies};
    const drifting = versions.filter(
      (entry) => declaredDeps?.[entry.name] && declaredDeps[entry.name] !== entry.version,
    );
    if (drifting.length > 0) {
      warn(
        '依赖声明',
        drifting
          .map(
            (entry) =>
              `${entry.name} 声明 ${declaredDeps[entry.name]}、安装 ${entry.version}`,
          )
          .join('；'),
      );
    } else {
      pass('依赖声明', 'package.json 与 node_modules 版本一致');
    }
  } catch (error) {
    warn('依赖声明', `无法读取 package.json：${error instanceof Error ? error.message : String(error)}`);
  }

  const binName = process.platform === 'win32' ? 'remotion.cmd' : 'remotion';
  const cliBinary = path.join(ROOT, 'node_modules', '.bin', binName);
  if (existsSync(cliBinary)) {
    pass('Remotion CLI', `node_modules/.bin/${binName}`);
  } else {
    warn('Remotion CLI', `node_modules/.bin/${binName} 不存在 —— npm install 可能不完整`);
  }
}

function checkSkeleton() {
  const missing = REQUIRED_FILES.filter((relative) => !existsSync(path.join(ROOT, relative)));
  if (missing.length > 0) {
    fail('项目骨架', `缺少文件：${missing.join('、')}`);
  } else {
    pass('项目骨架', `入口与数据文件齐全（${REQUIRED_FILES.length} 个）`);
  }

  const registry = path.join(ROOT, 'src', 'compositions.ts');
  if (!existsSync(registry)) {
    return;
  }
  const text = readFileSync(registry, 'utf8');
  const missingMarkers = REGISTRY_MARKERS.filter((marker) => !text.includes(marker));
  if (missingMarkers.length > 0) {
    warn(
      '注册表标记',
      `src/compositions.ts 缺少标记：${missingMarkers.join('、')} —— scripts/new-composition.mjs 将无法插入`,
    );
  } else {
    pass('注册表标记', '两个 @new-composition 标记就位');
  }
}

async function checkTypeStripping() {
  const files = ['src/timeline.ts', 'src/theme.ts'];
  for (const relative of files) {
    const file = path.join(ROOT, relative);
    if (!existsSync(file)) {
      continue;
    }
    try {
      await import(pathToFileURL(file).href);
      pass('类型剥离', `${relative} 可被 Node 直接加载`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      fail(
        '类型剥离',
        `${relative} 加载失败（node tools/*.ts 依赖它）：${reason.split('\n')[0]}`,
      );
    }
  }
}

function checkPublicDir() {
  const publicDir = path.join(ROOT, 'public');
  if (!existsSync(publicDir)) {
    warn('public/', '目录不存在 —— 需要放素材时创建 public/images、public/audio 等');
    return;
  }
  const entries = readdirSync(publicDir, {withFileTypes: true});
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  pass(
    'public/',
    directories.length > 0 ? `子目录：${directories.join('、')}` : '存在（当前为空）',
  );
}

async function checkPorts() {
  for (const port of STUDIO_PORTS) {
    const free = await isPortFree(port);
    if (free) {
      pass(`端口 ${port}`, '空闲');
    } else {
      warn(`端口 ${port}`, '已被占用 —— Remotion Studio 默认走 3000，可用 --port 换一个');
    }
  }
}

function checkDisk() {
  const free = freeDiskBytes();
  const drive = path.parse(ROOT).root;
  if (free === null) {
    warn('磁盘空间', `无法读取 ${drive} 剩余空间`);
    return;
  }
  if (free < MIN_FREE_BYTES) {
    fail('磁盘空间', `${drive} 剩余 ${formatBytes(free)}，低于 2 GB —— 渲染中间帧会写满磁盘`);
    return;
  }
  if (free < COMFORTABLE_FREE_BYTES) {
    warn('磁盘空间', `${drive} 剩余 ${formatBytes(free)}，建议保持 10 GB 以上`);
    return;
  }
  pass('磁盘空间', `${drive} 剩余 ${formatBytes(free)}`);
}

function checkOutWritable() {
  const outDir = path.join(ROOT, 'out');
  const probe = path.join(outDir, `.doctor-write-test-${process.pid}`);
  try {
    mkdirSync(outDir, {recursive: true});
    writeFileSync(probe, 'ok', 'utf8');
    rmSync(probe, {force: true});
    pass('out/ 可写', '渲染输出目录可用');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail('out/ 可写', `无法写入 out/：${reason}`);
    try {
      rmSync(probe, {force: true});
    } catch {
      // Best effort only.
    }
  }
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  if (argv.length > 0) {
    console.error(`✗ 未知参数 ${argv.join(' ')}\n`);
    printHelp();
    process.exit(2);
  }

  console.log(`▶ 环境自检（${ROOT}）`);
  console.log('');

  checkNode();
  checkNpm();
  checkFfmpeg();
  checkTypeScript();
  checkDependencies();
  checkSkeleton();
  await checkTypeStripping();
  checkPublicDir();
  await checkPorts();
  checkDisk();
  checkOutWritable();

  const passed = results.filter((entry) => entry.level === 'pass').length;
  const warned = results.filter((entry) => entry.level === 'warn').length;
  const failed = results.filter((entry) => entry.level === 'fail').length;

  console.log('');
  console.log(`汇总：PASS ${passed} · WARN ${warned} · FAIL ${failed}`);

  if (failed > 0) {
    console.log('');
    console.log(`✗ 有 ${failed} 项失败，请先修复再渲染（npm install / 升级 Node / 检查磁盘）。`);
    process.exit(1);
  }

  console.log('');
  console.log('✓ 环境可用。下一步：npm run dev（预览）或 npm run render:hq（出片）。');
}

main().catch((error) => {
  console.error(`✗ 自检失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

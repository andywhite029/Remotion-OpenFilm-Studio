// Static-asset reference checker.
//
// Files under `public/` are invisible to webpack: components reach them at
// render time through `staticFile('images/x.png')` or a root-relative URL such
// as `/images/x.png`. A typo therefore does not fail the build, it just renders
// a broken frame — sometimes minutes into a render. This script closes that gap:
//
//   1. Walk `src/**/*.{ts,tsx}` and collect every literal asset reference.
//   2. Check each one resolves to a real file under `public/`.
//   3. Reverse-check `public/` for large files nothing references (WARN only:
//      an unused render input may simply be waiting for its shot).
//
// Dynamic references (`staticFile(someVariable)`) cannot be resolved statically
// and are reported as unverified instead of guessed at.
//
// Run with `node tools/checkAssets.ts` or as part of `npm run check`.
// Exit codes: 0 = every reference resolves, 1 = at least one is missing.

import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC_DIR = path.join(ROOT, 'src');
const PUBLIC_DIR = path.join(ROOT, 'public');

/** Orphans at least this large are worth a WARN; smaller ones are just listed. */
const ORPHAN_THRESHOLD = 512 * 1024;

/** Paths under `public/` that are not "content" and should not be reported. */
const IGNORED_FILES = new Set(['.gitkeep', '.DS_Store', 'Thumbs.db']);

/** File extensions we treat as assets when a literal starts with `/`. */
const ASSET_EXTENSIONS = [
  'png',
  'jpe?g',
  'gif',
  'webp',
  'avif',
  'bmp',
  'ico',
  'svg',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'flac',
  'mp4',
  'mov',
  'webm',
  'json',
  'glb',
  'gltf',
  'hdr',
  'exr',
  'woff2?',
  'ttf',
  'otf',
  'eot',
].join('|');

const STATIC_FILE_LITERAL = /staticFile\s*\(\s*(['"`])([^'"`]*?)\1\s*\)/g;
const STATIC_FILE_DYNAMIC = /staticFile\s*\(\s*(?!['"`])/g;
const ROOT_RELATIVE_URL = new RegExp(
  `(['"\`])\\/([^'"\`\\s]+?\\.(?:${ASSET_EXTENSIONS}))\\1`,
  'gi',
);

type Reference = {
  /** The literal as written: `images/x.png` or `/images/x.png`. */
  raw: string;
  kind: 'staticFile' | 'url';
  file: string;
  line: number;
};

const problems: string[] = [];
const warnings: string[] = [];

function problem(message: string): void {
  problems.push(message);
}

function warn(message: string): void {
  warnings.push(message);
}

/** Recursively list files under `dir` (absolute paths). Missing dir => empty. */
function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) {
    return files;
  }
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

/** 1-based line number of `index` in `text`. */
function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

/**
 * True when `index` sits inside a `//` or `/* *\/` comment.
 *
 * This matters because source comments love to show examples like
 * `// staticFile('images/hero.png')`, and a commented example is not a
 * reference. Handles whole-line comments, doc-comment continuations and inline
 * comments, while ignoring the `//` in URLs such as `https://…`.
 */
function isInsideComment(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const lineEndRaw = text.indexOf('\n', index);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  const line = text.slice(lineStart, lineEnd);
  const offset = index - lineStart;

  const trimmed = line.trimStart();
  if (trimmed.startsWith('*') || trimmed.startsWith('//')) {
    return true;
  }

  // Inline block comment: `/* ... */` or a JSX `{/* ... */}` wrapper.
  const blockStart = line.lastIndexOf('/*', offset);
  if (blockStart !== -1) {
    const blockEnd = line.indexOf('*/', blockStart);
    if (blockEnd === -1 || blockEnd > offset) {
      return true;
    }
  }

  // Inline line comment, but not the `//` of `https://`.
  const lineComment = line.lastIndexOf('//', offset);
  if (lineComment !== -1 && line[lineComment - 1] !== ':') {
    return true;
  }

  return false;
}

/** Root-relative path as written in a component => path relative to `public/`. */
function normalizePublicPath(raw: string): string | null {
  const withoutPrefix = raw.trim().replace(/^\/+/, '');
  const withoutQuery = withoutPrefix.split('?')[0].split('#')[0];
  if (withoutQuery.length === 0) {
    return null;
  }
  const normalized = path.posix.normalize(withoutQuery);
  if (normalized === '.' || normalized.startsWith('..')) {
    return null;
  }
  return normalized;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// ---------------------------------------------------------------------------
// Collect references.
// ---------------------------------------------------------------------------

console.log('▶ 校验静态资源引用（public/）');

if (!existsSync(SRC_DIR)) {
  console.log('  ✗ src/ 目录不存在：请在项目根目录运行本脚本');
  process.exit(1);
}

const srcFiles = walk(SRC_DIR).filter((file) => /\.(ts|tsx)$/i.test(file));
const references: Reference[] = [];
let dynamicCalls = 0;
let unverifiable = 0;

for (const absolute of srcFiles) {
  const text = readFileSync(absolute, 'utf8');
  const display = path.relative(ROOT, absolute).split(path.sep).join('/');

  for (const match of text.matchAll(STATIC_FILE_LITERAL)) {
    const raw = match[2];
    const index = match.index ?? 0;
    // Comments can mention calls; they are not references.
    if (isInsideComment(text, index)) {
      continue;
    }
    if (raw.includes('${')) {
      unverifiable += 1;
      continue;
    }
    references.push({raw, kind: 'staticFile', file: display, line: lineOf(text, index)});
  }

  dynamicCalls += [...text.matchAll(STATIC_FILE_DYNAMIC)].length;

  for (const match of text.matchAll(ROOT_RELATIVE_URL)) {
    const raw = match[2];
    const index = match.index ?? 0;
    if (isInsideComment(text, index)) {
      continue;
    }
    if (raw.startsWith('//') || raw.includes('${')) {
      // Protocol-relative URL or a template literal: not a public-file path.
      unverifiable += 1;
      continue;
    }
    references.push({raw, kind: 'url', file: display, line: lineOf(text, index)});
  }
}

// ---------------------------------------------------------------------------
// Forward check: every reference must resolve to a real file in public/.
// ---------------------------------------------------------------------------

const referenced = new Set<string>();

if (!existsSync(PUBLIC_DIR)) {
  warn('public/ 目录不存在：请创建 public/（images/、audio/ 等），Remotion 的 publicDir 指向它');
}

for (const reference of references) {
  const normalized = normalizePublicPath(reference.raw);

  if (normalized === null) {
    problem(
      `${reference.file}:${reference.line} 的引用 "${reference.raw}" 不是合法的 public/ 相对路径`,
    );
    continue;
  }

  referenced.add(normalized);
  const target = path.join(PUBLIC_DIR, normalized);
  const found = existsSync(target) && statSync(target).isFile();

  if (!found) {
    problem(
      `${reference.file}:${reference.line} 引用 "${reference.raw}"，` +
        `但 public/${normalized} 不存在`,
    );
  } else {
    console.log(`  ✓ ${normalized}  ← ${reference.file}:${reference.line}`);
  }
}

// ---------------------------------------------------------------------------
// Reverse check: large files under public/ that nothing references.
// ---------------------------------------------------------------------------

const publicFiles = walk(PUBLIC_DIR).filter((absolute) => {
  const name = path.basename(absolute);
  if (IGNORED_FILES.has(name)) {
    return false;
  }
  const relative = path.relative(PUBLIC_DIR, absolute).split(path.sep).join('/');
  return !relative.startsWith('out/');
});

const orphans: {relative: string; size: number}[] = [];
let smallOrphans = 0;

for (const absolute of publicFiles) {
  const relative = path.relative(PUBLIC_DIR, absolute).split(path.sep).join('/');
  if (referenced.has(relative)) {
    continue;
  }
  const {size} = statSync(absolute);
  if (size >= ORPHAN_THRESHOLD) {
    orphans.push({relative, size});
  } else {
    smallOrphans += 1;
  }
}

for (const orphan of orphans) {
  warn(`public/${orphan.relative}（${formatBytes(orphan.size)}）没有被 src 引用`);
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

const staticFileCount = references.filter((ref) => ref.kind === 'staticFile').length;
const urlCount = references.length - staticFileCount;

console.log(
  `\n  扫描 src：${srcFiles.length} 个 .ts/.tsx 文件；` +
    `引用：${staticFileCount} 处 staticFile()，${urlCount} 处根相对 URL`,
);

if (dynamicCalls + unverifiable > 0) {
  console.log(
    `  ! 另有 ${dynamicCalls + unverifiable} 处动态引用（如 staticFile(variable)）无法静态检查`,
  );
}

if (references.length === 0) {
  console.log('  ! 没有发现静态资源引用（模板默认不带素材是正常的）');
}

for (const message of warnings) {
  console.log(`  ! ${message}`);
}

for (const message of problems) {
  console.log(`  ✗ ${message}`);
}

const orphanNote =
  orphans.length > 0
    ? `，孤儿大文件 ${orphans.length} 个`
    : smallOrphans > 0
      ? `，未引用小文件 ${smallOrphans} 个`
      : '';

console.log(
  `\n汇总：引用 ${references.length} 处，缺失 ${problems.length} 处` +
    `${orphanNote}`,
);

if (problems.length > 0) {
  console.log(`\n✗ 失败：${problems.length} 处静态资源缺失`);
  process.exit(1);
}

console.log(
  `\n✓ 静态资源引用全部有效${warnings.length > 0 ? `（${warnings.length} 项提示）` : ''}`,
);

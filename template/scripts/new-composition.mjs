#!/usr/bin/env node
// Scaffold a new Remotion composition.
//
// The template keeps composition registration in one table: `src/compositions.ts`
// is the only place a film is declared, and `Root.tsx` just maps over it. Adding
// a composition therefore means three edits: create the component, add an import,
// add an entry. This script does all three, and it locates the two insertion
// points by marker comments (`// @new-composition-import`, `// @new-composition`)
// so it keeps working when the table grows.
//
// Usage:
//   node scripts/new-composition.mjs <PascalCaseName> [--duration N]
//                                    [--width N] [--height N] [--fps N]
//
// Exit codes: 0 = generated, 1 = project state conflict (file/id exists, markers
// missing), 2 = bad arguments.

import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEQUENCES_DIR = path.join(ROOT, 'src', 'sequences');

/** The registry that holds `COMPOSITIONS`; markers live here. */
const REGISTRY_FILE = path.join(ROOT, 'src', 'compositions.ts');
const IMPORT_MARKER = '// @new-composition-import';
const ENTRY_MARKER = '// @new-composition';

/** Fallback registration schema, used when the table is empty. */
const DEFAULT_ENTRY_KEYS = ['id', 'component', 'durationInFrames', 'fps', 'width', 'height'];

const VALUE_FLAGS = new Set(['duration', 'width', 'height', 'fps']);
const NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

function printHelp() {
  console.log(`生成新的 Remotion 合成，并自动注册到 src/compositions.ts。

用法：
  node scripts/new-composition.mjs <PascalCaseName> [选项]

参数：
  <PascalCaseName>   合成名，PascalCase，例如 ProductTour、DataStory

选项：
  --duration N       合成长度（帧），默认取 src/timeline.ts 的 VIDEO.DURATION
  --width N          画面宽度，默认 VIDEO.WIDTH
  --height N         画面高度，默认 VIDEO.HEIGHT
  --fps N            帧率，默认 VIDEO.FPS
  -h, --help         显示本帮助

生成：
  src/sequences/<Name>.tsx
  并在 src/compositions.ts 的两个标记处插入 import 与注册项。

示例：
  node scripts/new-composition.mjs ProductTour
  node scripts/new-composition.mjs DataStory --duration 600 --fps 30
`);
}

function usageError(message) {
  console.error(`✗ ${message}\n`);
  console.error('用法：node scripts/new-composition.mjs <PascalCaseName> [--duration N] [--width N] [--height N] [--fps N]');
  console.error('帮助：node scripts/new-composition.mjs --help');
  process.exit(2);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Parse `--key value` / `--key=value` flags plus positionals. */
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
          usageError(`--${key} 缺少数值`);
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

/** Positive-integer flag, or a usage error. */
function parsePositiveInt(name, raw) {
  if (!/^\d+$/.test(raw)) {
    usageError(`--${name} 必须是正整数，收到 "${raw}"`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < 1) {
    usageError(`--${name} 必须大于 0，收到 ${value}`);
  }
  return value;
}

/** Load the template's format defaults from `src/timeline.ts` when possible. */
async function readTimelineDefaults() {
  const fallback = {width: 1920, height: 1080, fps: 30, duration: 300};
  const file = path.join(ROOT, 'src', 'timeline.ts');

  if (!existsSync(file)) {
    return fallback;
  }

  try {
    const timeline = await import(pathToFileURL(file).href);
    const video = timeline.VIDEO ?? {};
    return {
      width: Number(video.WIDTH ?? fallback.width),
      height: Number(video.HEIGHT ?? fallback.height),
      fps: Number(video.FPS ?? fallback.fps),
      duration: Number(video.DURATION ?? fallback.duration),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`  ! 读取 src/timeline.ts 默认值失败，改用 1920x1080@30 / 300 帧（${reason}）`);
    return fallback;
  }
}

/** Find the registry file and make sure both markers are present. */
function loadRegistry() {
  const candidates = [REGISTRY_FILE, path.join(ROOT, 'src', 'Root.tsx')];
  const srcDir = path.join(ROOT, 'src');

  if (existsSync(srcDir)) {
    for (const absolute of readdirSync(srcDir, {recursive: true})) {
      const file = path.join(srcDir, String(absolute));
      if (/\.(ts|tsx)$/i.test(file) && !candidates.includes(file)) {
        candidates.push(file);
      }
    }
  }

  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }
    const text = readFileSync(file, 'utf8');
    if (text.includes(IMPORT_MARKER) && text.includes(ENTRY_MARKER)) {
      const display = path.relative(ROOT, file).split(path.sep).join('/');
      return {file, display, text};
    }
  }

  fail(
    `未找到包含 ${IMPORT_MARKER} 与 ${ENTRY_MARKER} 两个标记的注册表文件。\n` +
      `  合成注册表应为 src/compositions.ts（见 src/Root.tsx 的映射方式）。\n` +
      `  若项目结构有变，请手动注册：\n` +
      `    import {Name} from './sequences/Name';\n` +
      `    {id: 'Name', component: Name, durationInFrames: <帧数>, fps: <fps>, width: <宽>, height: <高>},`,
  );
}

/**
 * Infer the field names of a COMPOSITIONS entry from the first object in the
 * table, so the scaffold keeps writing entries in the project's own schema.
 */
function inferEntryKeys(registryText) {
  const tableIndex = registryText.indexOf('COMPOSITIONS');
  if (tableIndex === -1) {
    return null;
  }
  const arrayStart = registryText.indexOf('[', tableIndex);
  if (arrayStart === -1) {
    return null;
  }

  // Find the first balanced `{...}` after the array opener.
  let depth = 0;
  let objectStart = -1;
  let index = arrayStart;
  while (index < registryText.length) {
    const char = registryText[index];
    if (char === '{') {
      if (depth === 0) {
        objectStart = index;
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        return extractTopLevelKeys(registryText.slice(objectStart + 1, index));
      }
    }
    index += 1;
  }

  return null;
}

/**
 * Key names of a TS object *type body*, at nesting depth 0 only — e.g.
 * `{id: string; component: FC; ...}` => ['id', 'component', ...].
 */
function extractTopLevelKeys(body) {
  const keys = [];
  let depth = 0;
  let i = 0;

  while (i < body.length) {
    const char = body[i];

    if (char === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      i += 1;
      continue;
    }

    if (depth === 0 && /[A-Za-z_$]/.test(char)) {
      const rest = body.slice(i);
      const declaration = /^([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(rest);
      if (declaration) {
        if (!keys.includes(declaration[1])) {
          keys.push(declaration[1]);
        }
        i += declaration[0].length;
        continue;
      }
      const identifier = /^[A-Za-z_$][\w$]*/.exec(rest);
      i += identifier ? identifier[0].length : 1;
      continue;
    }

    i += 1;
  }

  return keys.length > 0 ? keys : null;
}

/**
 * Render one `COMPOSITIONS` entry in the template's multi-line style.
 *
 * When a value equals the template default and the registry already imports
 * `VIDEO`, the entry references `VIDEO.WIDTH` & co. instead of a bare number:
 * a new composition should inherit the film's format, not freeze a copy of it
 * on the day it was scaffolded.
 */
function buildEntryLines(name, values, keys, defaults = null, useVideoRefs = false) {
  const fields = [];
  const unknown = [];

  const literal = (value, ref) => {
    const asDefault = defaults === null ? undefined : defaults[ref.toLowerCase()];
    return useVideoRefs && value === asDefault ? `VIDEO.${ref}` : String(value);
  };

  for (const key of keys) {
    const lower = key.toLowerCase();

    if (lower === 'id' || lower === 'name' || lower === 'slug') {
      fields.push(`${key}: '${name}'`);
    } else if (lower === 'label' || lower === 'title' || lower === 'description') {
      fields.push(`${key}: '${name}'`);
    } else if (lower === 'component' || lower === 'render' || lower === 'root') {
      fields.push(`${key}: ${name}`);
    } else if (lower.includes('duration') || lower === 'frames') {
      fields.push(`${key}: ${literal(values.duration, 'DURATION')}`);
    } else if (lower === 'width') {
      fields.push(`${key}: ${literal(values.width, 'WIDTH')}`);
    } else if (lower === 'height') {
      fields.push(`${key}: ${literal(values.height, 'HEIGHT')}`);
    } else if (lower === 'fps') {
      fields.push(`${key}: ${literal(values.fps, 'FPS')}`);
    } else {
      unknown.push(key);
    }
  }

  const lines = ['{'];
  for (const field of fields) {
    lines.push(`  ${field},`);
  }
  lines.push('},');

  return {lines, unknown};
}

/**
 * Insert `lines` immediately before the marker line.
 *
 * Markers are matched as whole lines (`line.trim() === marker`), not by
 * substring: `// @new-composition` is a substring of
 * `// @new-composition-import`, and a substring match would insert the
 * registration entry into the import block.
 */
function insertBeforeMarker(text, marker, lines) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const fileLines = text.split(/\r?\n/);
  let index = fileLines.findIndex((line) => line.trim() === marker);

  // Tolerate a marker line that carries a trailing note, e.g.
  // `// @new-composition  (insert here)` — but never let the import marker
  // satisfy the entry marker.
  if (index === -1) {
    index = fileLines.findIndex(
      (line) =>
        line.includes(marker) &&
        !(marker === ENTRY_MARKER && line.includes(IMPORT_MARKER)),
    );
  }

  if (index === -1) {
    fail(`注册表里找不到标记 ${marker}（文件可能在 ${marker} 前被改动）`);
  }

  const markerLine = fileLines[index];
  const indentMatch = /^[ \t]*/.exec(markerLine);
  const indent = indentMatch ? indentMatch[0] : '';
  const snippet = lines.map((line) => (line.length > 0 ? indent + line : line));

  fileLines.splice(index, 0, ...snippet);
  return {text: fileLines.join(eol), indent, index};
}

/** The generated component: renderable as-is, with TODOs pointing at the next edit. */
function buildComponent(name) {
  return `// ${name} — TODO: 一句话描述这个镜头。
//
// Generated by \`scripts/new-composition.mjs\`. This is a normal Remotion
// composition: a pure function of \`useCurrentFrame()\`, coloured from
// \`src/theme.ts\` and timed in frames — no wall clock, no random source.
//
// TODO: 替换下面的占位文案与版式，这里是唯一的业务代码。
// TODO: 想让这个镜头进入主片，就把它挂到 sequences/Main.tsx 的某个 beat 上，
//       并在 timeline.ts 里给该 beat 分配帧。

import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {BEAT_IDS, SEG} from '../timeline';
import {C, FONT_MONO, MOTION, SAFE, TYPE} from '../theme';

/**
 * The beat whose window contains \`frame\`, or 'unmapped' if the composition
 * runs past the film's timeline. Reading the label from \`SEG\` instead of
 * hard-coding it keeps this shot honest when the timeline is retimed.
 */
const beatAt = (frame: number): string => {
  for (const id of BEAT_IDS) {
    const {from, to} = SEG[id];
    if (frame >= from && frame < to) {
      return id;
    }
  }
  return 'unmapped';
};

export const ${name} = () => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();

  // Local animation: fade + lift in, fade out over the last frames.
  const enter = interpolate(frame, [0, MOTION.base], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(
    frame,
    [durationInFrames - MOTION.slow, durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const opacity = Math.min(enter, exit);
  const lift = interpolate(enter, [0, 1], [24, 0]);

  const beat = beatAt(frame);

  return (
    <AbsoluteFill style={{backgroundColor: C.surface, color: C.text}}>
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: \`\${SAFE.top}px \${SAFE.right}px \${SAFE.bottom}px \${SAFE.left}px\`,
        }}
      >
        <div
          style={{
            opacity,
            transform: \`translateY(\${lift}px)\`,
            textAlign: 'center',
            maxWidth: 1280,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: TYPE.micro,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: C.accent,
            }}
          >
            {beat} · {fps}fps
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: TYPE.display,
              fontWeight: 700,
              lineHeight: 1.06,
              letterSpacing: '-0.02em',
            }}
          >
            ${name}
          </div>
          <div style={{marginTop: 24, fontSize: TYPE.lead, color: C.textSecondary}}>
            TODO: 替换这段占位说明 · frame {frame} / {durationInFrames}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
`;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printHelp();
    process.exit(2);
  }

  const {positionals, options} = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  if (positionals.length === 0) {
    usageError('缺少合成名');
  }
  if (positionals.length > 1) {
    usageError(`一次只能生成一个合成，收到多个：${positionals.join(' ')}`);
  }

  const name = positionals[0];
  if (!NAME_PATTERN.test(name)) {
    usageError(
      `合成名 "${name}" 必须是 PascalCase（首字母大写，只含字母和数字，例如 ProductTour、DataStory）`,
    );
  }

  const defaults = await readTimelineDefaults();
  const values = {
    duration: options.duration === undefined ? defaults.duration : parsePositiveInt('duration', options.duration),
    width: options.width === undefined ? defaults.width : parsePositiveInt('width', options.width),
    height: options.height === undefined ? defaults.height : parsePositiveInt('height', options.height),
    fps: options.fps === undefined ? defaults.fps : parsePositiveInt('fps', options.fps),
  };

  if (values.width % 2 !== 0 || values.height % 2 !== 0) {
    console.warn(
      `  ! 宽高为奇数（${values.width}x${values.height}）：H.264 的 yuv420p 需要偶数尺寸，渲染可能失败`,
    );
  }

  const componentFile = path.join(SEQUENCES_DIR, `${name}.tsx`);
  const componentDisplay = path.relative(ROOT, componentFile).split(path.sep).join('/');

  if (existsSync(componentFile)) {
    fail(`${componentDisplay} 已存在，不会覆盖。请换一个名字或先删除该文件。`);
  }

  const registry = loadRegistry();

  // Idempotency: a partially generated composition must not be registered twice.
  const importPattern = new RegExp(`from\\s+['"]\\./sequences/${name}['"]`);
  if (importPattern.test(registry.text)) {
    fail(`${registry.display} 里已存在 "${name}" 的 import，不会重复插入。`);
  }
  const entryPattern = new RegExp(`\\bid\\s*:\\s*['"]${name}['"]`);
  if (entryPattern.test(registry.text)) {
    fail(`${registry.display} 里已存在 id: '${name}' 的注册项，不会重复插入。`);
  }

  const entryKeys = inferEntryKeys(registry.text) ?? DEFAULT_ENTRY_KEYS;
  const entry = buildEntryLines(
    name,
    values,
    entryKeys,
    defaults,
    registry.text.includes('VIDEO.'),
  );
  if (entry.unknown.length > 0) {
    console.warn(
      `  ! 无法推断注册表字段 ${entry.unknown.join(', ')} 的取值，已从插入项中省略；` +
        `请手动补齐，否则 npm run typecheck 会报错`,
    );
  }

  const importLine = `import {${name}} from './sequences/${name}';`;
  const importResult = insertBeforeMarker(registry.text, IMPORT_MARKER, [importLine]);
  const entryResult = insertBeforeMarker(importResult.text, ENTRY_MARKER, entry.lines);

  // Write the component first; if registering fails, remove it so a retry is clean.
  mkdirSync(SEQUENCES_DIR, {recursive: true});
  writeFileSync(componentFile, buildComponent(name), 'utf8');

  try {
    writeFileSync(registry.file, entryResult.text, 'utf8');
  } catch (error) {
    rmSync(componentFile, {force: true});
    const reason = error instanceof Error ? error.message : String(error);
    fail(`写入 ${registry.display} 失败，已回滚生成的组件：${reason}`);
  }

  console.log(`✓ 已生成 ${componentDisplay}`);
  console.log(`✓ 已注册到 ${registry.display}`);
  console.log(`    ${importLine}`);
  console.log(`    {id: '${name}', component: ${name}, durationInFrames: ${values.duration}, ...}`);
  console.log('');
  console.log(`  尺寸 ${values.width}x${values.height} @ ${values.fps}fps · ${values.duration} 帧 ` +
    `(${(values.duration / values.fps).toFixed(2)}s)`);
  console.log('');
  console.log('下一步：');
  console.log('  1. npm run dev       在 Studio 中预览并打磨画面');
  console.log(`  2. 编辑 ${componentDisplay}（替换占位文案）`);
  console.log('  3. npm run check     校验时间轴 / 素材 / 对比度');
}

main().catch((error) => {
  console.error(`✗ 生成失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

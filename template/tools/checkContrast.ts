// WCAG contrast checker for the design tokens.
//
// Colour is the easiest thing to get wrong in a video: it looks fine on the
// author's monitor, then turns to mud on a phone in daylight. `src/theme.ts`
// therefore declares a readability contract (`CONTRAST_PAIRS`) and this script
// enforces it.
//
// It measures WCAG 2.x relative luminance on every pair:
//
//   ratio = (L_lighter + 0.05) / (L_darker + 0.05)
//
// Colours may be `#rgb`, `#rrggbb`, `#rrggbbaa` or `rgb()/rgba()`. Translucent
// roles (shadows, glass, tints) are composited over their background before
// measuring, because that is what a viewer actually sees.
//
// The active palette `C` is always checked. If `PALETTES` is exported, every
// palette in it is checked too: the note says a dark cut is a one-line switch,
// and this keeps that promise honest.
//
// Run with `node tools/checkContrast.ts` or as part of `npm run check`.
// Exit codes: 0 = every pair meets its minimum, 1 = at least one does not.

import {C, CONTRAST_PAIRS, PALETTES, type Palette} from '../src/theme.ts';

type Rgba = {r: number; g: number; b: number; a: number};

/** Fully opaque white, used to flatten whatever is still translucent. */
const WHITE: Rgba = {r: 255, g: 255, b: 255, a: 1};

const HEX = /^#([0-9a-f]{3,8})$/i;
const RGB_FUNCTION = /^rgba?\(([^)]*)\)$/i;

/** Parse a CSS colour literal. Returns `null` when the syntax is not supported. */
function parseColor(value: string): Rgba | null {
  const input = value.trim();

  const hex = HEX.exec(input);
  if (hex) {
    let digits = hex[1];
    // #rgb / #rgba shorthand expands to #rrggbb / #rrggbbaa.
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((digit) => digit + digit).join('');
    }
    if (digits.length !== 6 && digits.length !== 8) {
      return null;
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const functional = RGB_FUNCTION.exec(input);
  if (!functional) {
    return null;
  }

  // Accepts `r, g, b`, `r g b`, `r g b / a` and percentage channels.
  const parts = functional[1].split(/[\s,/]+/).filter((part) => part.length > 0);
  if (parts.length < 3) {
    return null;
  }

  const channel = (raw: string): number =>
    raw.endsWith('%') ? (parseFloat(raw) / 100) * 255 : parseFloat(raw);

  const [rRaw, gRaw, bRaw] = parts;
  const aRaw: string | undefined = parts.length >= 4 ? parts[3] : undefined;

  const r = channel(rRaw);
  const g = channel(gRaw);
  const b = channel(bRaw);
  const a =
    aRaw === undefined
      ? 1
      : aRaw.endsWith('%')
        ? parseFloat(aRaw) / 100
        : parseFloat(aRaw);

  for (const value of [r, g, b]) {
    if (!Number.isFinite(value) || value < 0 || value > 255) {
      return null;
    }
  }
  if (!Number.isFinite(a)) {
    return null;
  }

  return {r, g, b, a: Math.min(1, Math.max(0, a))};
}

/** Alpha-composite `fg` over `bg` (source-over). */
function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const alpha = fg.a + bg.a * (1 - fg.a);
  if (alpha <= 0) {
    return {r: 0, g: 0, b: 0, a: 0};
  }
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha,
    a: alpha,
  };
}

/** Flatten a colour onto a backdrop, then onto white if transparency remains. */
function flatten(color: Rgba, backdrop: Rgba): Rgba {
  const composited = compositeOver(color, backdrop);
  return composited.a >= 1 ? composited : compositeOver(composited, WHITE);
}

/** sRGB channel (0-255) to linear-light channel. */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
function luminance(color: Rgba): number {
  return (
    0.2126 * toLinear(color.r) +
    0.7152 * toLinear(color.g) +
    0.0722 * toLinear(color.b)
  );
}

/** WCAG contrast ratio, always >= 1. */
function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

type PaletteUnderTest = {label: string; palette: Palette};

// The active palette comes first; the others are checked when exported.
const palettes: PaletteUnderTest[] = [{label: 'C（当前启用）', palette: C}];
for (const [name, palette] of Object.entries(PALETTES)) {
  if (palette === C) {
    continue;
  }
  palettes.push({label: `PALETTES.${name}`, palette});
}

console.log('▶ 校验 WCAG 对比度契约（src/theme.ts）');

let failures = 0;
let checks = 0;
const problems: string[] = [];

if (CONTRAST_PAIRS.length === 0) {
  console.log('  ! CONTRAST_PAIRS 为空：没有可校验的对比度对');
}

for (const {label, palette} of palettes) {
  console.log(`\n  ${label}`);

  for (const pair of CONTRAST_PAIRS) {
    checks += 1;

    const fgRaw = palette[pair.fg];
    const bgRaw = palette[pair.bg];
    const fg = parseColor(fgRaw);
    const bg = parseColor(bgRaw);

    if (!fg || !bg) {
      failures += 1;
      const broken = !fg ? `"${fgRaw}"（${String(pair.fg)}）` : `"${bgRaw}"（${String(pair.bg)}）`;
      const message = `${label}: 无法解析颜色 ${broken}，支持 #rrggbb / rgba()`;
      problems.push(message);
      console.log(`    ✗ ${message}`);
      continue;
    }

    // The background is composited onto canvas, then the foreground onto that:
    // translucent tints must be judged by what the viewer sees.
    const canvas = flatten(parseColor(palette.canvas) ?? WHITE, WHITE);
    const bgFlat = flatten(bg, canvas);
    const fgFlat = flatten(fg, bgFlat);
    const ratio = contrastRatio(fgFlat, bgFlat);
    const passed = ratio >= pair.min;

    if (!passed) {
      failures += 1;
      problems.push(
        `${label}: ${String(pair.fg)} on ${String(pair.bg)} 实测 ${ratio.toFixed(2)}:1，` +
          `要求 ≥ ${pair.min}:1（${pair.note}）`,
      );
    }

    const mark = passed ? '✓' : '✗';
    console.log(
      `    ${mark} ${String(pair.fg).padEnd(14)} on ${String(pair.bg).padEnd(14)} ` +
        `${ratio.toFixed(2).padStart(6)}:1  ≥ ${String(pair.min).padEnd(4)}  ${pair.note}`,
    );
  }
}

const required = palettes.length * CONTRAST_PAIRS.length;

if (failures > 0) {
  console.log(
    `\n✗ 失败：${failures}/${required} 对不达标注（共校验 ${checks} 对，${palettes.length} 套色板）`,
  );
  for (const message of problems) {
    console.log(`  ✗ ${message}`);
  }
  process.exit(1);
}

console.log(`\n✓ 对比度契约通过：${checks}/${required} 对全部达标`);

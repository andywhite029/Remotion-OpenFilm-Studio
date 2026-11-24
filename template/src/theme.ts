// The design tokens. THIS FILE IS THE ONLY PLACE LITERAL COLOURS LIVE.
//
// Two rules keep a 15-second film and a 50-second one looking like they were cut
// from the same roll:
//
//   1. Components read *semantic roles* (`C.text`, `C.surface`), never a hex.
//   2. A role means the same thing in every palette, so switching `C` from
//      `light` to `dark` is a one-line change and nothing else moves.
//
// Depth language differs between the two tones and that is the point: a dark UI
// floats things with glow, a light UI floats them with shadows and hairlines.
// There is deliberately no glow token — `text-shadow` is a bug everywhere.
//
// Like `timeline.ts`, this file has NO imports so `node tools/checkContrast.ts`
// can load it directly.

export type Palette = {
  // ---- surfaces ----
  /** Outside the frame's content area: the letterbox / stage backdrop. */
  canvas: string;
  /** The page: the main white (or near-black) ground. */
  surface: string;
  /** Secondary blocks: header, toolbars, tinted panels. */
  surfaceAlt: string;
  /** Recessed areas: input wells, code blocks, table stripes. */
  surfaceSunken: string;

  // ---- lines ----
  /** A visible boundary (panel outline, divider you are meant to see). */
  border: string;
  /** A hairline: row separators, the faintest possible seam. */
  borderSubtle: string;

  // ---- text ----
  /** Primary copy. Never pure black — pure black on white reads as a hole. */
  text: string;
  /** Secondary copy: descriptions, labels, axis ticks. */
  textSecondary: string;
  /** Micro copy: footnotes, units, counters. Still must clear 4.5:1. */
  textTertiary: string;

  // ---- brand accent ----
  /** Accent for text, icons, 1–2px strokes. Pre-calibrated to clear 4.5:1. */
  accent: string;
  /** The untouched brand colour: gradients, fills, large type, rings only. */
  accentBright: string;
  /** Dark end of the accent ramp: highlight end-states, pressed states. */
  accentInk: string;
  /** Accent as a wash behind content (a "tint", not a fill). */
  accentSubtle: string;
  /** Accent as a stroke (focus rings, selection outlines). */
  accentBorder: string;

  /** Text sitting on top of a solid `accent` fill. */
  onAccent: string;

  // ---- semantic status ----
  positive: string;
  warning: string;
  negative: string;

  // ---- elevation ----
  /** Resting card. Two small blurs, never one big one: video encoding bands. */
  shadow1: string;
  /** Raised / hovered. */
  shadow2: string;
  /** Floating media, the one element allowed to look like it hovers. */
  shadow3: string;

  // ---- overlays ----
  /** Frosted pill floating over media. */
  glass: string;
  /** Full-bleed darkening behind a modal or a caption. */
  scrim: string;
};

/**
 * Brand accent. Swap these three values when rebranding a film; `accent` must
 * clear 4.5:1 on `surface` (that is what `npm run check` enforces).
 *
 * Default: 光轮智能 purple. `#8b5cf6` is only 4.2:1 on white, which is why the
 * text-safe tier is the darker `#7c3aed` and the original survives as the
 * "bright" tier for gradients and rings.
 */
export const BRAND = {
  accent: '#7c3aed',
  accentBright: '#8b5cf6',
  accentInk: '#4c1d95',
} as const;

export const LIGHT: Palette = {
  canvas: '#eceef2',
  surface: '#ffffff',
  surfaceAlt: '#f7f8fa',
  surfaceSunken: '#f1f3f6',

  border: '#e3e6ec',
  borderSubtle: '#eef0f4',

  text: '#101418',
  textSecondary: '#5b6472',
  textTertiary: '#6b7280',

  accent: BRAND.accent,
  accentBright: BRAND.accentBright,
  accentInk: BRAND.accentInk,
  accentSubtle: 'rgba(124,58,237,0.08)',
  accentBorder: 'rgba(124,58,237,0.30)',
  onAccent: '#ffffff',

  positive: '#17693f',
  warning: '#8a5a00',
  negative: '#b3261e',

  // Shadows carry a hint of the neutral's temperature, never pure black, and
  // stay under ~0.16 opacity so nothing turns into a floating black slab.
  shadow1: '0 1px 2px rgba(16,20,24,0.05), 0 2px 8px rgba(16,20,24,0.06)',
  shadow2: '0 4px 16px rgba(16,20,24,0.08)',
  shadow3: '0 18px 48px rgba(16,20,24,0.14)',

  glass: 'rgba(255,255,255,0.88)',
  scrim: 'rgba(16,20,24,0.55)',
};

export const DARK: Palette = {
  canvas: '#0b0d10',
  surface: '#14171c',
  surfaceAlt: '#1b1f26',
  surfaceSunken: '#101318',

  border: '#2a3039',
  borderSubtle: '#22272e',

  text: '#f2f5f8',
  textSecondary: '#a8b2c0',
  textTertiary: '#8b95a3',

  // On a dark ground the accent has to move *up* in lightness to stay legible,
  // which is the mirror image of the light-tone calibration above.
  accent: '#a78bfa',
  accentBright: BRAND.accentBright,
  accentInk: '#c4b5fd',
  accentSubtle: 'rgba(167,139,250,0.14)',
  accentBorder: 'rgba(167,139,250,0.34)',
  onAccent: '#14171c',

  positive: '#4ade80',
  warning: '#fbbf24',
  negative: '#f87171',

  shadow1: '0 1px 2px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
  shadow2: '0 4px 16px rgba(0,0,0,0.45)',
  shadow3: '0 18px 48px rgba(0,0,0,0.55)',

  glass: 'rgba(20,23,28,0.75)',
  scrim: 'rgba(0,0,0,0.6)',
};

export const PALETTES = {light: LIGHT, dark: DARK} as const;
export type Tone = keyof typeof PALETTES;

/**
 * The active palette. Components import this and nothing else.
 * To make a dark cut, change this single line to `PALETTES.dark`.
 */
export const C: Palette = PALETTES.light;

/**
 * `#rrggbb` + alpha → `rgba(…, …)`.
 *
 * Status chips need a 10%-opacity bed of their own status colour, and that bed
 * has to follow the palette — a literal `rgba(23,105,63,0.10)` would be wrong
 * the moment `C` switches to `dark`, and would also break the "no bare colour
 * in a component" rule. Deriving the tint from the token keeps one source of
 * truth and needs no extra palette entry.
 *
 * Anything that is not a 6-digit hex is returned untouched, so passing an
 * already-translucent token through is harmless.
 */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return hex;
  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Readability contract, enforced by `tools/checkContrast.ts`.
 *
 * Only pairs that actually ship need to be listed — a list of every
 * combination would be noise. When you add a text colour or change a surface,
 * add the pair you just created here; the check then keeps it honest forever.
 */
export const CONTRAST_PAIRS: ReadonlyArray<{
  fg: keyof Palette;
  bg: keyof Palette;
  min: number;
  note: string;
}> = [
  {fg: 'text', bg: 'surface', min: 7, note: '标题/正文 on 页面'},
  {fg: 'text', bg: 'surfaceAlt', min: 7, note: '正文 on 次级面板'},
  {fg: 'text', bg: 'canvas', min: 7, note: '正文 on 画布'},
  {fg: 'textSecondary', bg: 'surface', min: 4.5, note: '次要文字 on 页面'},
  {fg: 'textSecondary', bg: 'surfaceAlt', min: 4.5, note: '次要文字 on 次级面板'},
  {fg: 'textTertiary', bg: 'surface', min: 4.5, note: '微文案（不许豁免）'},
  {fg: 'accent', bg: 'surface', min: 4.5, note: '强调色文字 on 页面'},
  {fg: 'accent', bg: 'surfaceAlt', min: 4.5, note: '强调色文字 on 次级面板'},
  {fg: 'onAccent', bg: 'accent', min: 4.5, note: '强调色块上的文字'},
  {fg: 'accentInk', bg: 'surface', min: 7, note: '高亮终点文字'},
  {fg: 'positive', bg: 'surface', min: 4.5, note: '正向状态'},
  {fg: 'warning', bg: 'surface', min: 4.5, note: '警告状态'},
  {fg: 'negative', bg: 'surface', min: 4.5, note: '错误状态'},
];

// ---------------------------------------------------------------------------
// Typography. Sizes are in CSS px at 1920x1080; the render presets only scale
// the whole composition, so these stay absolute.
// ---------------------------------------------------------------------------

/** Studio supplies the brand font; standalone Remotion can still use its system stack. */
export const FONT_SANS =
  "var(--brand-font, 'Segoe UI', 'Inter', 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif)";

/** Anything numeric that must not shift width: timecodes, readings, axes. */
export const FONT_MONO =
  "'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', monospace";

export const TYPE = {
  display: 96,
  h1: 68,
  h2: 48,
  h3: 34,
  lead: 28,
  body: 22,
  small: 17,
  micro: 13,
} as const;

export const LEADING = {
  tight: 1.06,
  snug: 1.2,
  normal: 1.5,
} as const;

/** Tracking for large display type; text set at 96px needs to be tightened. */
export const TRACK = {
  display: '-0.02em',
  heading: '-0.01em',
  normal: '0',
  /** For small caps kickers and all-caps labels. */
  caps: '0.12em',
} as const;

// ---------------------------------------------------------------------------
// Layout. One spacing scale, one safe area, so beats align to each other even
// when they were authored months apart.
// ---------------------------------------------------------------------------

export const SPACE = {
  xs: 8,
  sm: 12,
  md: 20,
  lg: 32,
  xl: 52,
  xxl: 80,
} as const;

/** Keep text out of the outermost ~5% so nothing is lost to player chrome. */
export const SAFE = {
  top: 72,
  right: 96,
  bottom: 72,
  left: 96,
} as const;

export const RADIUS = {
  card: 20,
  panel: 14,
  media: 16,
  chip: 999,
} as const;

/**
 * Motion durations in frames. Named so that two beats authored separately still
 * fade at the same speed — inconsistent easing is the fastest way to make a
 * programmatic film feel cheap.
 */
export const MOTION = {
  /** Micro transitions: a label appearing, a rule drawing. */
  fast: 12,
  /** The default reveal for a block of content. */
  base: 18,
  /** Big moves: a panel sliding in, a page-level crossfade. */
  slow: 30,
} as const;

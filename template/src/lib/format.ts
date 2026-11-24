// Pure numeric helpers and formatters.
//
// Everything here is a pure function of its arguments: nothing reads a clock, a
// random source, or module-level mutable state. That is what lets Remotion
// render frames out of order, in parallel, and produce the same result twice.
//
// Rule of thumb: if you are about to hand-roll an interpolation or call
// `.toFixed()` inline, the helper you want is already below.

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse lerp; guards the zero-length range. */
export function inverseLerp(a: number, b: number, v: number): number {
  if (b === a) return 0;
  return (v - a) / (b - a);
}

/** Remap `v` from [a,b] into [c,d], clamped to the output range. */
export function remap(
  v: number,
  a: number,
  b: number,
  c: number,
  d: number,
): number {
  return lerp(c, d, clamp(inverseLerp(a, b, v), 0, 1));
}

/** Round to `dp` decimals, avoiding 0.30000000000000004-style tails. */
export function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------------------
// Easing. All take and return a 0..1 progress.
// ---------------------------------------------------------------------------

export const linear = (t: number): number => t;

export function easeInQuad(t: number): number {
  return t * t;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

/** Hermite smoothstep — the safest default for opacity and position. */
export function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Ease-out with a slight overshoot; use for things that "land". */
export function easeOutBack(t: number, overshoot = 1.1): number {
  const c = overshoot;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

export function smoothstep(a: number, b: number, v: number): number {
  return smooth(clamp(inverseLerp(a, b, v), 0, 1));
}

// ---------------------------------------------------------------------------
// Windowing — the workhorses. Almost every reveal is one of these two.
// ---------------------------------------------------------------------------

/**
 * Clamped, normalised progress of `frame` through the window [from, to].
 * Returns 0 before the window and 1 after it, so callers never need to clamp.
 */
export function progress(frame: number, from: number, to: number): number {
  if (to === from) return frame < from ? 0 : 1;
  if (frame <= from) return 0;
  if (frame >= to) return 1;
  return (frame - from) / (to - from);
}

/** `progress` with an ease applied on top. */
export function easedProgress(
  frame: number,
  from: number,
  to: number,
  ease: (t: number) => number = easeInOutCubic,
): number {
  return ease(progress(frame, from, to));
}

/**
 * A 0 → 1 → 0 envelope over [from, to], for content that arrives and leaves.
 * `hold` is the fraction of the window spent at full opacity.
 */
export function envelope(
  frame: number,
  from: number,
  to: number,
  hold = 0.6,
): number {
  const ramp = (1 - hold) / 2;
  if (ramp <= 0) return frame >= from && frame < to ? 1 : 0;
  const t = progress(frame, from, to);
  return clamp(Math.min(t / ramp, (1 - t) / ramp), 0, 1);
}

/**
 * Linear interpolation across sorted [frame, value] keyframes.
 *
 * `smooth`-eased between keys, which is what makes hand-authored camera moves
 * read as moves rather than as a slideshow. Keys may be sparse and must be
 * sorted ascending; out-of-range frames clamp to the first/last value.
 */
export function keyframe(
  frame: number,
  keys: ReadonlyArray<readonly [number, number]>,
): number {
  if (keys.length === 0) return 0;
  const first = keys[0];
  if (frame <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1] = keys[i];
    if (frame <= f1) {
      const [f0, v0] = keys[i - 1];
      if (f1 === f0) return v1;
      return lerp(v0, v1, smooth(inverseLerp(f0, f1, frame)));
    }
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------------------
// Formatters. One place, so a reading and its axis tick never disagree about
// how many decimals a number has.
// ---------------------------------------------------------------------------

/** Thousands separators: 3456 → "3,456". */
export function count(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

/** 0.754 → "75%". */
export function percent(v: number, dp = 0): string {
  return `${(v * 100).toFixed(dp)}%`;
}

/** 0.45 → "450 mm". */
export function millimetres(v: number, dp = 0): string {
  return `${(v * 1000).toFixed(dp)} mm`;
}

/** 0.45 → "0.45 m". */
export function metres(v: number, dp = 2): string {
  return `${v.toFixed(dp)} m`;
}

/** 6.48 → "6.5 N". */
export function newtons(v: number, dp = 1): string {
  return `${v.toFixed(dp)} N`;
}

/** 8.42 → "8.42 J". */
export function joules(v: number, dp = 2): string {
  return `${v.toFixed(dp)} J`;
}

/** 0.754 (seconds in) → "754 ms". */
export function milliseconds(seconds: number): string {
  return `${Math.round(seconds * 1000)} ms`;
}

/** Frame count → SMPTE-ish "00:07:15" at the given fps. */
export function timecode(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const ff = Math.floor(frame % fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

/** Signed value with an explicit +, for deltas: 1.2 → "+1.2". */
export function signed(v: number, dp = 1): string {
  const s = v.toFixed(dp);
  return v >= 0 ? `+${s}` : s;
}

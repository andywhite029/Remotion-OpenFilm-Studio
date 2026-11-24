// Timing grammar, built on top of `lib/format` and the shot list in
// `timeline.ts`.
//
// The point of this module is that a beat's content never asks "which frame am
// I on?" — it asks "how far into my own beat am I?". That is what keeps a
// component reusable when the timeline is retimed: it reads its window from
// `SEG`, so shifting a beat moves its content with it and nothing else.
//
// Like the rest of `lib/`, everything here is a pure function of `frame`.

import {MOTION} from '../theme';
import {SEG, type SegId} from '../timeline';
import {
  clamp,
  easeInOutCubic,
  easeOutCubic,
  easedProgress,
  inverseLerp,
  lerp,
  progress,
} from './format';

/** Frames elapsed since the beat started. Negative before the beat. */
export function localFrame(frame: number, id: SegId): number {
  return frame - SEG[id].from;
}

/** Authored length of a beat in frames. */
export function beatLength(id: SegId): number {
  const {from, to} = SEG[id];
  return to - from;
}

/** True while `frame` sits inside the beat's window (from inclusive, to exclusive). */
export function inBeat(frame: number, id: SegId): boolean {
  const {from, to} = SEG[id];
  return frame >= from && frame < to;
}

/** 0..1 progress through the beat's whole window. */
export function beatProgress(
  frame: number,
  id: SegId,
  ease: (t: number) => number = (t) => t,
): number {
  const {from, to} = SEG[id];
  return easedProgress(frame, from, to, ease);
}

/**
 * A reveal that starts `delay` frames into a beat and takes `duration` frames.
 *
 * This is the single most-used helper in the template: a beat's first block
 * calls `revealIn(frame, 'metrics')`, a block 6 frames later calls
 * `revealIn(frame, 'metrics', 6)`. Because both trace the same curve from the
 * same origin, the content arrives as one gesture instead of several.
 */
export function revealIn(
  frame: number,
  id: SegId,
  delay = 0,
  duration: number = MOTION.base,
  ease: (t: number) => number = easeOutCubic,
): number {
  const start = SEG[id].from + delay;
  return ease(progress(frame, start, start + duration));
}

/**
 * The mirror of `revealIn`: 1 until `duration` frames before the beat ends,
 * then ramps to 0. Use it for anything that must be gone before the cut.
 */
export function revealOut(
  frame: number,
  id: SegId,
  duration: number = MOTION.base,
  ease: (t: number) => number = easeInOutCubic,
): number {
  const end = SEG[id].to;
  return 1 - ease(progress(frame, end - duration, end));
}

/**
 * A 0 → 1 → 0 envelope across the beat, for content that arrives and leaves
 * inside a single beat (a legal caption, a passing label).
 */
export function beatEnvelope(
  frame: number,
  id: SegId,
  hold = 0.65,
  ease: (t: number) => number = easeInOutCubic,
): number {
  const {from, to} = SEG[id];
  const t = progress(frame, from, to);
  const ramp = (1 - hold) / 2;
  if (ramp <= 0) return t > 0 && t < 1 ? 1 : 0;
  return ease(clamp(Math.min(t / ramp, (1 - t) / ramp), 0, 1));
}

/**
 * Per-item delay for a staggered group.
 *
 * `stagger(i, 4)` gives 0, 4, 8, 12 … — feed that into `revealIn` as the delay.
 * Capped so a 50-row list does not take two seconds to finish appearing.
 */
export function stagger(index: number, step = 4, max = 24): number {
  return Math.min(index * step, max);
}

/**
 * Piecewise-linear tempo map between a hand-authored "design" clock and the
 * real composition clock.
 *
 * Worth keeping in the toolbox for one specific job: slowing a section without
 * retiming anything else. You author in comfortable design frames, then list
 * `[design, real]` pairs — a *flat* span (two pairs with the same design value)
 * is a hold where the choreography stops dead while ambient motion keeps
 * running on `real`. Pairs must be ascending in `real`.
 */
export function tempoMap(
  pairs: ReadonlyArray<readonly [design: number, real: number]>,
): (realFrame: number) => number {
  if (pairs.length === 0) return (f) => f;
  return (realFrame: number): number => {
    const first = pairs[0];
    const last = pairs[pairs.length - 1];
    if (realFrame <= first[1]) return first[0];
    if (realFrame >= last[1]) return last[0];
    for (let i = 1; i < pairs.length; i++) {
      const [d0, r0] = pairs[i - 1];
      const [d1, r1] = pairs[i];
      if (realFrame <= r1) {
        if (r1 === r0) return d1;
        return lerp(d0, d1, inverseLerp(r0, r1, realFrame));
      }
    }
    return last[0];
  };
}

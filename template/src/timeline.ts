// The film's clock. Every timed thing is declared here and nowhere else —
// components never hardcode a frame number.
//
// This file deliberately has NO imports. `node tools/checkTimeline.ts` loads it
// through Node's native type stripping, so it must stay loadable outside the
// Remotion bundle. Keep it that way: data and arithmetic only.

/**
 * Composition format. These are the numbers Remotion renders at, and the ones
 * the render presets in `scripts/render.mjs` scale from.
 */
export const VIDEO = {
  WIDTH: 1920,
  HEIGHT: 1080,
  FPS: 30,
  /** Length of the `Main` composition in frames: 450 / 30 fps = 15.0 s. */
  DURATION: 450,
} as const;

/**
 * The shot list: one entry per beat, in story order.
 *
 * `from` is inclusive, `to` is exclusive, both in composition frames. The table
 * is expected to be contiguous and ascending — `npm run check` asserts it, so a
 * three-frame hole can never hide between two beats. To retime the film, edit
 * these numbers only; every component reads its window from here.
 */
export const SEG = {
  // 0.0s — 2.0s   the film introduces itself
  title: {from: 0, to: 60},
  // 2.0s — 5.2s   one sentence, full frame
  statement: {from: 60, to: 156},
  // 5.2s — 10.0s  numbers, drawn from data
  metrics: {from: 156, to: 300},
  // 10.0s — 13.2s the method, as steps
  process: {from: 300, to: 396},
  // 13.2s — 15.0s the sign-off
  end: {from: 396, to: 450},
} as const;

export type SegId = keyof typeof SEG;

/** Beat ids in story order. */
export const BEAT_IDS = Object.keys(SEG) as readonly SegId[];

/** First frame of the last beat's window end — i.e. the authored length. */
export const TIMELINE_END = Math.max(
  ...Object.values(SEG).map((beat) => beat.to),
);

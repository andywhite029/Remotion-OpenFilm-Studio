// The product film's shot list, in seconds.
//
// `scripts/build.mjs` lays the OpenFilm timeline out from this table and the
// adapters size their Remotion players from it, so retiming a shot is one edit
// here — the same rule as `template/src/timeline.ts`, kept in a file Node can
// load without a bundler (`scripts/build.mjs` imports it directly).
//
// 3 + 6 + 6.5 = 15.5 s of raw footage. The first edit in Studio trims 0.5 s off
// the head of the 3D shot (the product has barely started turning) and ripples
// the chart up, which is what lands the delivered film on 15.0 s.
export const SHOT_SECONDS = {
  intro: 3,
  product: 6,
  metrics: 6.5,
} as const;

/** Raw timeline length before any Studio trim: 15.5 s. */
export const RAW_SECONDS =
  SHOT_SECONDS.intro + SHOT_SECONDS.product + SHOT_SECONDS.metrics;

/** Delivered length after the planned 0.5 s trim of the product shot. */
export const DELIVERED_SECONDS = 15;

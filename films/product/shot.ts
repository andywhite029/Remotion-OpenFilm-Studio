// The four parameters a product shot exposes.
//
// One contract, three callers: `scripts/product-shot.mjs` (what an agent or an
// editor runs), the generated `scenes/shot.js` (what the browser bundle reads)
// and `scripts/build.mjs` (which writes that file). Validation lives here so a
// typo fails with the parameter's name instead of rendering a black frame.
//
// What is *not* a parameter, deliberately: materials and lights. They are art
// direction and stay in `ProductStage.tsx` / `ProductModel.tsx`; the four values
// below are the ones a non-author can safely change.

import {MODELS} from './models.ts';

export type ModelId = keyof typeof MODELS;
export type ModelSpec = (typeof MODELS)[ModelId];

export type Shot = {
  /** Which GLB to show. Adding a model means one entry in `models.json`. */
  model: ModelId;
  /** Headline over the stage. Studio can also override the rendered text. */
  title: string;
  /** Turntable speed in degrees per second. `0` locks the product facing front. */
  speed: number;
  /** Camera distance from the product, in scene units. Larger = wider shot. */
  distance: number;
};

export const SHOT_LIMITS = {
  speed: {min: 0, max: 180, unit: '°/s'},
  distance: {min: 2.6, max: 7, unit: 'm'},
} as const;

/** Long titles wrap out of the safe area, so they are rejected, not clipped. */
export const TITLE_MAX = 48;

export const DEFAULT_SHOT: Shot = {
  model: 'boombox',
  title: 'BOOMBOX',
  speed: 55,
  distance: 4.2,
};

export const MODEL_IDS = Object.keys(MODELS) as ModelId[];

const SHOT_KEYS = ['model', 'title', 'speed', 'distance'] as const;

function numberIn(
  name: string,
  value: unknown,
  limit: {readonly min: number; readonly max: number; readonly unit: string},
): number {
  if (value === undefined) {
    return DEFAULT_SHOT[name as 'speed' | 'distance'];
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a number (${limit.unit})`);
  }
  if (value < limit.min || value > limit.max) {
    throw new RangeError(
      `${name} must be between ${limit.min} and ${limit.max}${limit.unit}`,
    );
  }
  return value;
}

/**
 * Validate a shot coming from JSON, a CLI flag or an agent's tool call.
 * Missing keys fall back to `DEFAULT_SHOT`; unknown keys are an error, so a
 * misspelled parameter is caught instead of silently ignored.
 */export function readShot(source: unknown): Shot {
  if (source === undefined || source === null) return DEFAULT_SHOT;
  if (typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('shot must be an object');
  }
  const value = source as Record<string, unknown>;

  const unknown = Object.keys(value).filter(
    (key) => !(SHOT_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    throw new TypeError(
      `unknown shot parameter(s): ${unknown.join(', ')} — expected ${SHOT_KEYS.join(', ')}`,
    );
  }

  const model = value.model ?? DEFAULT_SHOT.model;
  if (typeof model !== 'string' || !Object.hasOwn(MODELS, model)) {
    throw new TypeError(`model must be one of ${MODEL_IDS.join(', ')}`);
  }

  const title = value.title ?? DEFAULT_SHOT.title;
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new TypeError('title must be a non-empty string');
  }
  if (title.trim().length > TITLE_MAX) {
    throw new RangeError(`title must be at most ${TITLE_MAX} characters`);
  }

  return {
    model: model as ModelId,
    title: title.trim(),
    speed: numberIn('speed', value.speed, SHOT_LIMITS.speed),
    distance: numberIn('distance', value.distance, SHOT_LIMITS.distance),
  };
}

/**
 * Read the generated `scenes/shot.js`, which carries the four authored values
 * plus the model's derived label/spec for the title card. Only the authored
 * values are validated; the extras are presentation data.
 */
export function readShotData(source: unknown): Shot {
  if (source === null || typeof source !== 'object') return readShot(source);
  const value = source as Record<string, unknown>;
  return readShot({
    model: value.model,
    title: value.title,
    speed: value.speed,
    distance: value.distance,
  });
}

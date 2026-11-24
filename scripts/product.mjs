// The product shot's parameter file: one reader and one writer.
//
// `scripts/build.mjs` reads it and regenerates `scenes/shot.js`; the CLI writes
// it. Both go through `readShot`, so the JSON, the generated script and the
// browser can never disagree about what a valid shot is.
//
// Nothing here touches `film.html`: parameters are data, and the timeline keeps
// the editor's overrides and trims.

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {MODELS} from '../films/product/models.ts';
import {DEFAULT_SHOT, readShot} from '../films/product/shot.ts';

export const SHOT_FILE = 'product-shot.json';
const SHOT_SCRIPT = path.join('scenes', 'shot.js');

/** The project's current shot, or the defaults when it has no file yet. */
export async function readShotFile(projectDir) {
  let text;
  try {
    text = await readFile(path.join(projectDir, SHOT_FILE), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return DEFAULT_SHOT;
    throw error;
  }
  try {
    return readShot(JSON.parse(text));
  } catch (error) {
    throw new Error(`${path.join(projectDir, SHOT_FILE)}: ${error.message}`, {cause: error});
  }
}

/** Write both halves: the human/AI-readable JSON and the script the page loads. */
export async function writeShot(projectDir, source) {
  const shot = readShot(source);
  await writeShotScript(projectDir, shot);
  await writeFile(
    path.join(projectDir, SHOT_FILE),
    `${JSON.stringify(shot, null, 2)}\n`,
  );
  return shot;
}

/**
 * Regenerate only `scenes/shot.js`. A build calls this so the page always
 * reflects the JSON, even when the JSON is edited by hand.
 *
 * The generated file carries the model's label and spec as well: the native
 * title card reads the same data, so one parameter change renames the shot, its
 * HUD and the opening card together. Studio overrides still win, because the
 * host applies them after the page has drawn itself.
 */
export async function writeShotScript(projectDir, shot) {
  const model = MODELS[shot.model];
  await mkdir(path.join(projectDir, 'scenes'), {recursive: true});
  await writeFile(
    path.join(projectDir, SHOT_SCRIPT),
    `// Generated from ${SHOT_FILE} by scripts/build.mjs. Edit the JSON (or run\n// \`npm run shot -- ...\`), not this file.\nwindow.__PRODUCT_SHOT__ = ${JSON.stringify({...shot, label: model.label, spec: model.spec}, null, 2)};\n`,
  );
}

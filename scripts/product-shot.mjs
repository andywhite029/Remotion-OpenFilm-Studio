#!/usr/bin/env node
// Change the product shot's four parameters, then regenerate its data file.
//
// This is the agent/editor entry point — an AI calls it with a shot it wants,
// a human tweaks one value:
//
//   npm run shot -- --project projects/Product-Film \
//     --model water-bottle --title AQUA --speed 60 --distance 3.8
//
// It writes `product-shot.json` and `scenes/shot.js` and touches nothing else,
// so every Studio edit (text overrides, trims, clip order) survives. Refresh
// Studio to see the new shot; no rebundle is needed.

import path from 'node:path';
import {parseArgs} from 'node:util';
import {MODELS} from '../films/product/models.ts';
import {MODEL_IDS, SHOT_LIMITS, TITLE_MAX} from '../films/product/shot.ts';
import {readShotFile, writeShot, SHOT_FILE} from './product.mjs';

const {values} = parseArgs({options: {
  project: {type: 'string', default: 'projects/Product-Film'},
  model: {type: 'string'},
  title: {type: 'string'},
  speed: {type: 'string'},
  distance: {type: 'string'},
  print: {type: 'boolean'},
  json: {type: 'boolean'},
}});

const projectDir = path.resolve(values.project);
const current = await readShotFile(projectDir);

const changes = {
  ...(values.model !== undefined ? {model: values.model} : {}),
  ...(values.title !== undefined ? {title: values.title} : {}),
  ...(values.speed !== undefined ? {speed: Number(values.speed)} : {}),
  ...(values.distance !== undefined ? {distance: Number(values.distance)} : {}),
};

try {
  const shot = Object.keys(changes).length > 0 && !values.print
    ? await writeShot(projectDir, {...current, ...changes})
    : current;

  if (values.json) {
    console.log(JSON.stringify(shot, null, 2));
  } else {
    console.log(`product shot → ${path.join(projectDir, SHOT_FILE)}`);
    console.log(`  model     ${shot.model.padEnd(12)} (${MODELS[shot.model].file})`);
    console.log(`  title     ${shot.title}`);
    console.log(`  speed     ${shot.speed}${SHOT_LIMITS.speed.unit}`);
    console.log(`  distance  ${shot.distance}${SHOT_LIMITS.distance.unit}`);
    if (Object.keys(changes).length > 0 && !values.print) {
      console.log('\nscenes/shot.js rewritten. Refresh Studio to see it; film.html was not touched.');
    }
  }
} catch (error) {
  console.error(`product shot: ${error.message}`);
  console.error(`  model     one of ${MODEL_IDS.join(', ')}`);
  console.error(`  title     1–${TITLE_MAX} characters`);
  console.error(`  speed     ${SHOT_LIMITS.speed.min}–${SHOT_LIMITS.speed.max}${SHOT_LIMITS.speed.unit}`);
  console.error(`  distance  ${SHOT_LIMITS.distance.min}–${SHOT_LIMITS.distance.max}${SHOT_LIMITS.distance.unit}`);
  process.exit(1);
}

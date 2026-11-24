// The product shot's adapter: load the GLB first, then mount the player.
//
// Everything that must be true for *every* frame — a decoded model, an uploaded
// texture — happens before the player exists. That is what makes Studio's
// "jump to the middle of the timeline" land on a finished product: `film.frame(t)`
// never has to wait for a load, and the first painted frame is already complete.
//
// If the load fails the page keeps the poster and publishes a film whose
// `ready` rejects, so Studio reports the problem instead of hanging.

import {ProductShot} from '../films/product/ProductShot';
import {loadModel} from '../films/product/load-model';
import {MODELS} from '../films/product/models';
import {readShotData} from '../films/product/shot';
import {SHOT_SECONDS} from '../films/product/shots';
import {VIDEO} from '../template/src/timeline';
import {mountScene} from './mount-scene';

type Host = Window & {__PRODUCT_SHOT__?: unknown};

const host = window as Host;
const frames = Math.round(SHOT_SECONDS.product * VIDEO.FPS);

async function start() {
  const shot = readShotData(host.__PRODUCT_SHOT__);
  const model = await loadModel(MODELS[shot.model].file);
  mountScene({
    scene: 'product',
    offset: 0,
    duration: frames,
    total: frames,
    video: VIDEO,
    Content: () => <ProductShot shot={shot} model={model} />,
  });
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = `产品镜头加载失败：${message}`;
  const ready = Promise.reject(new Error(message));
  // Registered so the rejection is handled even if the host checks `ready`
  // late; awaiting the same promise still rejects.
  ready.catch(() => {});
  (window as unknown as {film?: unknown}).film = {
    width: VIDEO.WIDTH,
    height: VIDEO.HEIGHT,
    duration: SHOT_SECONDS.product,
    ready,
    frame: () => Promise.reject(new Error(message)),
  };
  throw error;
}

void start().catch(fail);

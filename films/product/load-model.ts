// Loading a GLB, once, before the player is allowed to render its first frame.
//
// The adapter awaits this *before* mounting the Remotion player. That ordering
// is the whole point: a seek to 3.4 s must land on a finished product, not on
// the empty stage that a loader mounted inside the tree would show for the
// first paint. `GLTFLoader` resolves only after the JSON, the buffers and every
// embedded image have been decoded, so awaiting it covers the textures too.

import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {Object3D} from 'three';

/** The part of a loaded GLB the shot uses. */
export type LoadedModel = {scene: Object3D};

const cache = new Map<string, Promise<LoadedModel>>();

/**
 * Load (and memoise) one model from the project's `public/models/` folder.
 *
 * `scripts/build.mjs` copies `assets/models/` there for every project, so the
 * URL is always relative to a page in `scenes/`. The cache is per page: a frame
 * never waits on the network again after the first one.
 */
export function loadModel(file: string): Promise<LoadedModel> {
  const url = `../public/${file}`;
  let pending = cache.get(url);
  if (pending === undefined) {
    pending = new GLTFLoader()
      .loadAsync(url)
      .then((gltf) => ({scene: gltf.scene as Object3D}))
      .catch((error: unknown) => {
        cache.delete(url);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not load the product model ${url}: ${message}`);
      });
    cache.set(url, pending);
  }
  return pending;
}

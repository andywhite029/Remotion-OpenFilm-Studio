// The product film's initial OpenFilm timeline, in one place.
//
// `build.mjs` writes it only when the project has no `film.html` yet — after
// that the timeline belongs to Studio. `verify-product.mjs` also uses it to
// start a test copy from a known cut, so the test cannot drift from what a new
// project is created with.

import {SHOT_SECONDS} from '../films/product/shots.ts';
import {VIDEO} from '../template/src/timeline.ts';

export function productFilmHtml() {
  const clips = [
    `  <iframe id="intro" title="原生标题卡" src="native/title.html#t=0,${SHOT_SECONDS.intro}"></iframe>`,
    `  <iframe id="product" title="产品 3D" at="${SHOT_SECONDS.intro}" src="scenes/product.html#t=0,${SHOT_SECONDS.product}"></iframe>`,
    `  <iframe id="metrics" title="参数图表" at="${SHOT_SECONDS.intro + SHOT_SECONDS.product}" src="scenes/metrics.html#t=0,${SHOT_SECONDS.metrics}"></iframe>`,
  ];
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=${VIDEO.WIDTH}, height=${VIDEO.HEIGHT}"></head><body>\n<section>\n${clips.join('\n')}\n</section>\n</body></html>\n`;
}

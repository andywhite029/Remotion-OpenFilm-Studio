import {build} from 'esbuild';
import {mkdir, writeFile, cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SEG, VIDEO} from '../template/src/timeline.ts';
import {C} from '../template/src/theme.ts';
import {readShotFile, writeShotScript} from './product.mjs';
import {productFilmHtml} from './product-timeline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'projects', 'OpenFilm-Native');
const product = path.join(root, 'projects', 'Product-Film');
const shot = await readShotFile(product);

/** One Remotion page. `scripts` is ordered: data first, then the bundle.
 * `boot` is the poster shown until the player has committed a frame.
 * `ground` is painted on `html,body` immediately, so a clip that is mounted but
 * has not executed its bundle yet shows paper rather than the host's black
 * backdrop — a cut must never flash black. */
const html = (scene, scripts = ['page.js'], boot = '', ground = C.surface) => `<!doctype html>\n<html lang="zh-CN" data-scene="${scene}"><head><meta charset="utf-8"><meta name="viewport" content="width=${VIDEO.WIDTH}, height=${VIDEO.HEIGHT}"><link rel="stylesheet" href="../public/brand/brand.css"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}html,body{background:${ground}}*{box-sizing:border-box}${boot ? `#boot{position:fixed;inset:0;display:grid;place-content:center;background:${C.canvas};color:${C.textSecondary};font:500 18px/1.7 system-ui,sans-serif}` : ''}</style></head><body>${boot ? `<div id="boot">${boot}</div>` : ''}<div id="root"></div>${scripts.map(src => `<script src="${src}"></script>`).join('')}</body></html>\n`;
const watermarkTrack = `<section id="brand-watermark" title="官方水印" locked>
  <img id="company-logo" src="assets/brand/watermarks/guanglun_full-color/16x9/logo_16x9_BR.png#t=0,${VIDEO.DURATION / VIDEO.FPS}">
</section>`;
const specs = [
  {name: 'Remotion-Template', builds: [{entry: 'page.tsx', out: 'page.js'}],
    pages: [...Object.keys(SEG), 'main'], overlay: watermarkTrack,
    clips: Object.entries(SEG).map(([id, {from, to}]) => `  <iframe id="${id}" title="${id}" src="scenes/${id}.html#t=0,${(to - from) / VIDEO.FPS}"${from ? ` at="${from / VIDEO.FPS}"` : ''}></iframe>`)},
  {name: 'ThreeDemo', builds: [{entry: 'three.tsx', out: 'page.js'}], pages: ['three'], ground: {three: C.surfaceAlt},
    clips: ['  <iframe id="three" title="ThreeDemo" src="scenes/three.html#t=0,5"></iframe>']},
  // The 15 s product film. Remotion owns the two generated shots; OpenFilm's
  // timeline, trims and overrides live in film.html.
  {name: 'Product-Film',
    builds: [{entry: 'product.tsx', out: 'product.js'}, {entry: 'metrics.tsx', out: 'metrics.js'}],
    pages: ['product', 'metrics'],
    scripts: {product: ['shot.js', 'product.js'], metrics: ['metrics.js']},
    boot: {product: '正在加载产品模型与贴图…'},
    ground: {product: C.canvas, metrics: C.surface},
    filmHtml: productFilmHtml(),
  },
];

await Promise.all(specs.map(async ({name, builds, pages, scripts = {}, boot = {}, ground = {}, overlay = '', clips = [], filmHtml}) => {
  const project = path.join(root, 'projects', name);
  const scenes = path.join(project, 'scenes');
  await mkdir(scenes, {recursive: true});
  for (const {entry, out} of builds) {
    await build({entryPoints: [path.join(root, 'adapter', entry)], outfile: path.join(scenes, out),
      bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: {'process.env.NODE_ENV': '"production"'}, logLevel: 'info'});
  }
  await cp(path.join(root, 'template/public'), path.join(project, 'public'), {recursive: true});
  // Use exactly the same font and official PNGs in both Studio workflows.
  for (const relative of ['public/brand', 'assets/brand/watermarks']) {
    await cp(path.join(brand, relative), path.join(project, relative), {recursive: true});
  }
  if (name === 'Remotion-Template') {
    await cp(path.join(brand, 'motion-kit'), path.join(project, 'motion-kit'), {recursive: true});
  }
  if (name === 'Product-Film') {
    await cp(path.join(root, 'assets/models'), path.join(project, 'public/models'), {recursive: true});
    await writeShotScript(project, shot);
  }
  await Promise.all(pages.map(name => writeFile(path.join(scenes, `${name}.html`),
    html(name, scripts[name] ?? ['page.js'], boot[name] ?? '', ground[name] ?? C.surface))));
  try {
    // Exclusive creation: a rebuild must never overwrite a Studio timeline.
    const film = filmHtml ?? `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=${VIDEO.WIDTH}, height=${VIDEO.HEIGHT}"></head><body>\n${overlay ? `${overlay}\n` : ''}<section>\n${clips.join('\n')}\n</section>\n</body></html>\n`;
    await writeFile(path.join(project, 'film.html'), film, {flag: 'wx'});
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}));
console.log('Built Remotion scenes. Existing OpenFilm timelines preserved.');

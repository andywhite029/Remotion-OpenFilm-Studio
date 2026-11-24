import {build} from 'esbuild';
import {mkdir, writeFile, cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SEG, VIDEO} from '../template/src/timeline.ts';
import {C} from '../template/src/theme.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'projects', 'OpenFilm-Native');
/** One Remotion page.
 *
 * `ground` is painted on `html,body` in the head, so a clip that is mounted but
 * has not executed its bundle yet shows paper rather than the host's black
 * backdrop — a cut must never flash black. */
const html = (scene, ground = C.surface) => `<!doctype html>\n<html lang="zh-CN" data-scene="${scene}"><head><meta charset="utf-8"><meta name="viewport" content="width=${VIDEO.WIDTH}, height=${VIDEO.HEIGHT}"><link rel="stylesheet" href="../public/brand/brand.css"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}html,body{background:${ground}}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="page.js"></script></body></html>\n`;
const watermarkTrack = `<section id="brand-watermark" title="官方水印" locked>
  <img id="company-logo" src="assets/brand/watermarks/guanglun_full-color/16x9/logo_16x9_BR.png#t=0,${VIDEO.DURATION / VIDEO.FPS}">
</section>`;
const specs = [
  {name: 'Remotion-Template', entry: 'page.tsx', overlay: watermarkTrack, pages: [...Object.keys(SEG), 'main'],
    clips: Object.entries(SEG).map(([id, {from, to}]) => `  <iframe id="${id}" title="${id}" src="scenes/${id}.html#t=0,${(to - from) / VIDEO.FPS}"${from ? ` at="${from / VIDEO.FPS}"` : ''}></iframe>`)},
  {name: 'ThreeDemo', entry: 'three.tsx', pages: ['three'], ground: {three: C.surfaceAlt},
    clips: ['  <iframe id="three" title="ThreeDemo" src="scenes/three.html#t=0,5"></iframe>']},
];

await Promise.all(specs.map(async ({name, entry, pages, ground = {}, overlay = '', clips}) => {
  const project = path.join(root, 'projects', name);
  const scenes = path.join(project, 'scenes');
  await mkdir(scenes, {recursive: true});
  await build({entryPoints: [path.join(root, 'adapter', entry)], outfile: path.join(scenes, 'page.js'),
    bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: {'process.env.NODE_ENV': '"production"'}, logLevel: 'info'});
  await cp(path.join(root, 'template/public'), path.join(project, 'public'), {recursive: true});
  // Use exactly the same font and official PNGs in both Studio workflows.
  for (const relative of ['public/brand', 'assets/brand/watermarks']) {
    await cp(path.join(brand, relative), path.join(project, relative), {recursive: true});
  }
  if (name === 'Remotion-Template') {
    await cp(path.join(brand, 'motion-kit'), path.join(project, 'motion-kit'), {recursive: true});
  }
  await Promise.all(pages.map(name => writeFile(path.join(scenes, `${name}.html`), html(name, ground[name] ?? C.surface))));
  try {
    // Exclusive creation: a rebuild must never overwrite a Studio timeline.
    await writeFile(path.join(project, 'film.html'), `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=${VIDEO.WIDTH}, height=${VIDEO.HEIGHT}"></head><body>\n${overlay ? `${overlay}\n` : ''}<section>\n${clips.join('\n')}\n</section>\n</body></html>\n`, {flag: 'wx'});
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}));
console.log('Built Remotion scenes. Existing OpenFilm timelines preserved.');

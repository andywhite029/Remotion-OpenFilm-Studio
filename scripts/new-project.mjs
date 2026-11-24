#!/usr/bin/env node
// Copy a clean working project; never change the template it runs from.
import {cp, mkdir, readdir, readFile, writeFile, stat, realpath, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const source = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const {positionals, values} = parseArgs({allowPositionals: true, options: {
  native: {type: 'boolean'}, 'with-node-modules': {type: 'boolean'},
}});
if (positionals.length !== 1) throw new Error('To copy the full studio template, run npm run new -- <targetFolder>');
if (values.native && values['with-node-modules']) {
  throw new Error('--native installs only OpenFilm; run npm ci in the new folder instead of using --with-node-modules.');
}

// Resolve existing ancestors as well, so a path through a junction cannot copy into the template.
async function resolveTarget(p) {
  try { return await realpath(p); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(p);
    if (parent === p) throw error;
    return path.join(await resolveTarget(parent), path.basename(p));
  }
}
const target = path.resolve(positionals[0]);
const relative = path.relative(source, await resolveTarget(target));
if (!relative || (!path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..')) {
  throw new Error('Target must be outside the template folder.');
}
try {
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(target)).length) {
    throw new Error(`Target must be an empty directory: ${target}`);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const exclude = new Set(['node_modules', 'vendor', '.git', '.studio', 'exports', 'verification', '_smoke']);
const studioState = new Set(['settings.json', 'markers.json', 'subtitles.json']);
const generated = new Set(['Remotion-Template', 'ThreeDemo'].flatMap(name =>
  ['scenes/page.js', 'public/brand', 'assets/brand/watermarks'].map(file => `projects/${name}/${file}`)));
generated.add('projects/Remotion-Template/motion-kit');
const copyable = (p) => {
  const rel = path.relative(source, p).split(path.sep);
  const item = rel.at(-1);
  if (exclude.has(item) || generated.has(rel.join('/'))) return false;
  const toolDir = rel.indexOf('.film');
  return toolDir < 0 || item === '.film' || (toolDir === rel.length - 2 && studioState.has(item));
};
const copy = (from, to) => cp(path.join(source, from), path.join(target, to), {
  recursive: true, filter: copyable, force: false, errorOnExist: true, verbatimSymlinks: true,
});

console.log(`template: ${source}`);
console.log(`target:   ${target}`);
if (values.native) {
  await copy('starters/openfilm', '.');
  const project = 'projects/OpenFilm-Native';
  await copy(project, project);
  await mkdir(path.join(target, 'scripts'), {recursive: true});
  await copy('scripts/studio.mjs', 'scripts/studio.mjs');
} else {
  await copy('.', '.');
  if (values['with-node-modules']) {
    console.log('copying node_modules (this can take a while)...');
    const deps = path.join(source, 'node_modules');
    if (!(await stat(deps).catch(() => null))?.isDirectory()) throw new Error('Template has no node_modules; run npm ci in the copy.');
    await cp(deps, path.join(target, 'node_modules'), {recursive: true, force: false, errorOnExist: true});
  }
}

const name = path.basename(target).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'film-project';
for (const file of ['package.json', 'package-lock.json']) {
  const at = path.join(target, file);
  const json = JSON.parse(await readFile(at, 'utf8'));
  json.name = name;
  if (json.packages?.['']) json.packages[''].name = name;
  await writeFile(at, JSON.stringify(json, null, 2) + '\n');
}

console.log(values.native ? '\nOpenFilm-native project ready.' : '\nFull Remotion + OpenFilm Studio template copied, including brand assets and motion presets.');
console.log('双击新目录中的 启动Studio.cmd，或在终端运行以下命令。');
console.log(`  cd "${target}"`);
console.log('  npm start');

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir, stat, writeFile} from 'node:fs/promises';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {values} = parseArgs({options: {
  project: {type: 'string', default: 'Remotion-Template'},
  build: {type: 'boolean'},
  browser: {type: 'boolean'},
  init: {type: 'boolean'},
}});
const name = values.project;
if (!name.trim() || name === '.' || name === '..' || /[\\/:]/.test(name)) {
  throw new Error('--project must name a folder directly inside projects/');
}
const project = path.join(root, 'projects', name);
if (values.init) initialize();
if (values.build && name.toLowerCase() !== 'openfilm-native') await import('./build.mjs');
const filmFile = path.join(project, 'film.html');
if (!(await stat(filmFile).catch(() => null))?.isFile()) {
  throw new Error(`Project not found: ${filmFile}. For Remotion projects, run npm run build first.`);
}

process.env.OPENFILM_HOME = path.join(root, '.studio');
process.env.OPENFILM_SHARED_HOME = process.env.OPENFILM_HOME;
process.env.OPENFILM_LIBRARY = path.join(root, 'projects');
process.env.OPENFILM_EXPORTS = path.join(root, 'exports');
process.env.OPENFILM_NO_UPDATE_CHECK = '1';
await mkdir(process.env.OPENFILM_HOME, {recursive: true});
const {startStudio} = await import('openfilm/studio');
const studio = await startStudio({port: Number(process.env.REMOTION_STUDIO_PORT || 4849), stays: true, advertise: true, openBrowser: () => {}, onQuit: () => process.emit('SIGINT')});
try {
  const headers = {'content-type': 'application/json', 'x-studio-key': studio.key};
  const opened = await fetch(`${studio.origin}/api/open`, {method: 'POST', headers, body: JSON.stringify({path: project})});
  const data = await opened.json();
  if (!opened.ok) throw new Error(JSON.stringify(data));
  await writeFile(path.join(root, '.studio/session.json'), JSON.stringify({origin: studio.origin, filmOrigin: studio.filmOrigin, key: studio.key, ...data}, null, 2));
  const url = data.url || studio.origin;
  console.log(`OpenFilm Studio • ${name}: ${url}`);
  console.log('Press Ctrl+C to stop.');
  if (values.browser && process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {stdio: 'ignore', windowsHide: true});
} catch (error) {
  await studio.close();
  throw error;
}
let closing = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
  if (closing) return;
  closing = true;
  await studio.close();
  process.exit(0);
});

function initialize() {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run npm start to initialize and start Studio.');

  const run = (args, options = {}) => spawnSync(process.execPath, args, {
    cwd: root, stdio: 'inherit', ...options,
  });
  const checked = (result, message) => {
    if (result.error) throw new Error(message, {cause: result.error});
    if (result.status !== 0) throw new Error(message);
  };

  const deps = run([npm, 'ls', '--all', '--include=dev', '--silent'], {stdio: 'ignore'});
  if (deps.error) throw new Error('Could not check project dependencies.', {cause: deps.error});
  if (deps.status !== 0) {
    console.log('正在安装项目依赖…');
    checked(run([npm, 'ci', '--include=dev', '--prefer-offline', '--no-audit']), 'Dependency installation failed. Run npm start to retry.');
  }

  const require = createRequire(import.meta.url);
  const playwright = path.dirname(require.resolve('playwright-core/package.json'));
  console.log('正在检查 Chromium…');
  checked(run([path.join(playwright, 'cli.js'), 'install', 'chromium-headless-shell'], {
    env: {...process.env, PLAYWRIGHT_SKIP_BROWSER_GC: '1'},
  }), 'Chromium installation failed. Run npm start to retry.');
}

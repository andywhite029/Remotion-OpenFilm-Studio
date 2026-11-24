// Preloaded by render.mjs before the Remotion CLI loads its renderer modules.
// Internal APIs: deliberately pinned to the version whose call sites we verified.
import {createRequire} from 'node:module';
import {realpathSync, statSync} from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const rendererRoot = path.dirname(require.resolve('@remotion/renderer/package.json'));
const {version} = require('@remotion/renderer/package.json');

/** Resolve only files served by this render's own public URL. */
export function resolvePublicAsset(src, {origin, publicDir}) {
  try {
    const url = new URL(src);
    if (url.origin !== origin || url.username || url.password || !url.pathname.startsWith('/public/')) {
      return null;
    }
    const relative = decodeURIComponent(url.pathname.slice('/public/'.length));
    // Reject Windows separators, drive letters, ADS, NUL and traversal on all OSes.
    if (relative.includes('\\') || relative.includes(':') || relative.includes('\0') ||
        relative.split('/').some((part) => part === '.' || part === '..')) {
      return null;
    }
    const root = realpathSync(publicDir);
    const candidate = path.resolve(root, relative);
    const inside = path.relative(root, candidate);
    if (!inside || inside.startsWith(`..${path.sep}`) || inside === '..' || path.isAbsolute(inside)) {
      return null;
    }
    // Follow public symlinks as Remotion's HTTP server does; never copy or delete targets.
    const file = realpathSync(candidate);
    return statSync(file).isFile() ? file : null;
  } catch {
    // Missing files, malformed URLs and non-local sources keep Remotion's normal behavior.
    return null;
  }
}

if (version !== '4.0.541') {
  console.warn(`[local-public-assets] Remotion ${version}: 本地素材优化未启用；请复核内部接口。`);
} else {
  const servers = require(path.join(rendererRoot, 'dist', 'serve-static.js'));
  const assets = require(path.join(rendererRoot, 'dist', 'assets', 'download-and-map-assets-to-file.js'));
  const mappings = new WeakMap();
  const serveStatic = servers.serveStatic;
  const downloadAsset = assets.downloadAsset;

  servers.serveStatic = async (bundleDir, options) => {
    const server = await serveStatic(bundleDir, options);
    // A null bundleDir is a proxy for a remote bundle and has no local public files.
    if (bundleDir !== null) {
      mappings.set(options.downloadMap, {
        origin: `http://localhost:${server.port}`,
        publicDir: path.join(bundleDir, 'public'),
      });
    }
    const close = server.close;
    server.close = async (...args) => {
      mappings.delete(options.downloadMap);
      return close(...args);
    };
    return server;
  };

  assets.downloadAsset = async (options) => {
    const mapping = mappings.get(options.downloadMap);
    const local = mapping && resolvePublicAsset(options.src, mapping);
    if (!local) {
      return downloadAsset(options);
    }
    if (options.shouldAnalyzeAudioImmediately) {
      const {getAudioChannelsAndDuration} = require(path.join(rendererRoot, 'dist', 'assets', 'get-audio-channels.js'));
      await getAudioChannelsAndDuration({...options, src: local, cancelSignal: options.cancelSignalForAudioAnalysis});
    }
    // Do not add local paths to the temporary download map or emit download events.
    return local;
  };
}

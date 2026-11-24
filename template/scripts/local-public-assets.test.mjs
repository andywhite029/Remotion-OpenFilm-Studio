import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {resolvePublicAsset} from './local-public-assets.mjs';

const require = createRequire(import.meta.url);
const renderer = path.dirname(require.resolve('@remotion/renderer/package.json'));
const {serveStatic} = require(path.join(renderer, 'dist/serve-static.js'));
const {makeDownloadMap, cleanDownloadMap} = require(path.join(renderer, 'dist/assets/download-map.js'));
const {downloadAsset} = require(path.join(renderer, 'dist/assets/download-and-map-assets-to-file.js'));

test('public assets reuse served files; remote/data assets keep downloading; cleanup preserves originals', async () => {
  const bundle = mkdtempSync(path.join(os.tmpdir(), 'remotion-local-public-test-'));
  const publicDir = path.join(bundle, 'public');
  mkdirSync(publicDir);
  const name = '中文 空格 # %.mp4';
  const source = path.join(publicDir, name);
  writeFileSync(source, 'fixture');
  const downloadMap = makeDownloadMap(48000);
  let server;
  try {
    server = await serveStatic(bundle, {downloadMap, logLevel: 'error', indent: false,
      offthreadVideoCacheSizeInBytes: null, binariesDirectory: null, offthreadVideoThreads: 1, forceIPv4: true});
    const origin = `http://localhost:${server.port}`;
    const mapping = {origin, publicDir};
    const src = `${origin}/public/${encodeURIComponent(name)}?v=1#fragment`;
    const options = {src, downloadMap, logLevel: 'error', indent: false,
      shouldAnalyzeAudioImmediately: false, binariesDirectory: null};
    assert.equal(resolvePublicAsset(src, mapping), source);
    for (const bad of [
      `https://example.com/public/${encodeURIComponent(name)}`,
      `${origin.replace('localhost', '127.0.0.1')}/public/${encodeURIComponent(name)}`,
      `${origin}/public/missing.mp4`, `${origin}/public/%ZZ`,
      `${origin}/public/..%2Fsecret`, `${origin}/public/C%3Afile`,
      `${origin}/public/a%5Cb`, `${origin}/public/`, `${origin}/publicity/${name}`,
    ]) assert.equal(resolvePublicAsset(bad, mapping), null, bad);
    const files = await Promise.all(Array.from({length: 8}, () => downloadAsset(options)));
    assert.deepEqual(files, Array(8).fill(source));
    assert.deepEqual(readdirSync(downloadMap.downloadDir), []);
    // Same server, outside /public: must still use the original HTTP download.
    writeFileSync(path.join(bundle, 'remote.txt'), 'http fallback');
    const remote = await downloadAsset({...options, src: `${origin}/remote.txt`});
    assert.equal(path.dirname(remote), downloadMap.downloadDir);
    assert.equal(readFileSync(remote, 'utf8'), 'http fallback');
    const data = await downloadAsset({...options, src: 'data:text/plain;base64,aGVsbG8='});
    assert.equal(readFileSync(data, 'utf8'), 'hello');
    // Exercise the actual OffthreadVideo proxy, including immediate audio analysis.
    const video = path.join(publicDir, 'video.mp4');
    const generated = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
      'color=c=red:s=64x64:r=30:d=1', '-f', 'lavfi', '-i',
      'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', video], {encoding: 'utf8'});
    assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
    const before = readdirSync(downloadMap.downloadDir);
    const params = new URLSearchParams({src: `${origin}/public/video.mp4`, time: '0',
      transparent: 'false', toneMapped: 'false'});
    const frame = await fetch(`${origin}/proxy?${params}`);
    assert.equal(frame.status, 200, await (frame.ok ? Promise.resolve('') : frame.text()));
    assert.ok((await frame.arrayBuffer()).byteLength > 0);
    assert.deepEqual(readdirSync(downloadMap.downloadDir), before);
    assert.equal(Object.keys(downloadMap.durationOfAssetCache).length > 0, true);
    cleanDownloadMap(downloadMap);
    assert.equal(existsSync(source), true);
  } finally {
    if (server) await server.close();
    cleanDownloadMap(downloadMap);
    // bundle is the verified, unique directory created by this test above.
    rmSync(bundle, {recursive: true, force: true});
  }
});

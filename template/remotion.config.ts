// Remotion CLI configuration.
// https://www.remotion.dev/docs/config
//
// This file is read by every `remotion` command, including `remotion studio`,
// `remotion still`, and `remotion render`, so it is the single place where
// render-wide settings live.
import {Config} from '@remotion/cli/config';

// Directory that holds the composition registry (registerRoot lives there).
Config.setEntryPoint('src/index.ts');
Config.setPublicDir('public');

// ---- frames ----
// JPEG is ~3x cheaper to encode than PNG at capture time and visually
// indistinguishable once the H.264 pass is done.
//
// Caveat worth knowing before you change it: when frames are JPEG, Remotion
// emits **yuvj420p** (full-range) regardless of `setPixelFormat` below —
// measured, not assumed. Deliverables that must be broadcast-standard
// limited-range yuv420p (or that need lossless text edges) should render with
// `--image-format=png`, which the `master` preset in scripts/render.mjs does.
Config.setVideoImageFormat('jpeg');

// ---- video ----
Config.setCodec('h264');
// Applies when the frame format is PNG; JPEG frames override it to yuvj420p.
Config.setPixelFormat('yuv420p');
// H.264 defaults to CRF 18 when no bitrate is supplied. Keep CRF implicit here:
// an explicit CRF conflicts with NVENC hardware encoding and --video-bitrate.
// scripts/render.mjs supplies CRF for CPU presets and bitrate for GPU presets.

// ANGLE gives a real, hardware-backed WebGL context inside Remotion's headless
// Chromium. SwiftShader (the software fallback) is far too slow for 3D frames
// and is deprecated by Chromium. Every 3D project here relies on this line.
Config.setChromiumOpenGlRenderer('angle');

// ---- output ----
Config.setOverwriteOutput(true);

// ---- async assets ----
// GLB / USD-derived models and web fonts are loaded over delayRender. The
// 30s default is tight on a cold disk with a 20 MB GLB; 60s removes the
// "delayRender() was called too many times" class of flake.
Config.setDelayRenderTimeoutInMilliseconds(60000);

// ---- browser ----
// By default Remotion downloads and uses its own Chrome Headless Shell, which
// is the most reproducible choice and needs no per-machine edit. To reuse a
// locally installed browser instead (some GPU drivers only run WebGL there),
// set REMOTION_BROWSER to the executable path — e.g.
//   $env:REMOTION_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
// This is deliberately opt-in: a hardcoded path is the usual reason a template
// that works on one machine fails on the next.
const browser = process.env.REMOTION_BROWSER;
if (browser) {
  Config.setBrowserExecutable(browser);
}

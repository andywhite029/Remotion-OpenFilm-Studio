import {createRef, useLayoutEffect, type ComponentType} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Player, type PlayerRef} from '@remotion/player';
import {useCurrentFrame} from 'remotion';

type Video = {WIDTH: number; HEIGHT: number; FPS: number};
type SceneSpec = {
  scene: string; offset: number; duration: number; total: number;
  video: Video; Content: ComponentType;
  /** Extra barrier run after a frame is committed, before `film.frame(t)` resolves.
   * Defaults to a paint barrier; pass a longer one if a scene needs more. */
  settle?: () => Promise<void> | void;
};

/** Two animation frames: one commits the draw, the next lets the compositor
 * paint it. Not an animation — a barrier, so `film.frame(t)` resolves on pixels
 * that are actually on screen. Without it a freshly mounted clip can be
 * screenshotted (by Studio or by an export) before its first paint, which shows
 * up as a blank or black frame right after a cut. */
const nextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
type Film = {width: number; height: number; duration: number; ready: Promise<void>; frame(t: number): Promise<void>};

export function mountScene({scene, offset, duration, total, video, Content, settle = nextPaint}: SceneSpec) {
  const host = window as Window & {remotion_staticBase: string; film: Film};
  const {WIDTH, HEIGHT, FPS} = video;
  const player = createRef<PlayerRef>();
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  let committed = -1;
  let error: unknown = null;

  function Commit() {
    const frame = useCurrentFrame();
    useLayoutEffect(() => { committed = frame; }, [frame]);
    return null;
  }
  const Scene = () => <><Content/><Commit/></>;

  function identify() {
    // Keep the same IDs as earlier builds so existing overrides still apply.
    // New components should prefer author-provided, stable semantic IDs.
    const walk = (el: Element, path: string) => {
      if (!el.id) el.id = `of-${scene}-${path}`;
      [...el.children].forEach((child, i) => walk(child, `${path}-${i}`));
    };
    [...container.children].forEach((child, i) => walk(child, String(i)));
  }

  const ready = (async () => {
    host.remotion_staticBase = '../public';
    flushSync(() => root.render(<Player ref={player} component={Scene}
      compositionWidth={WIDTH} compositionHeight={HEIGHT}
      durationInFrames={total} fps={FPS} initialFrame={offset}
      controls={false} autoPlay={false} loop={false} muted
      clickToPlay={false} doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false}
      style={{width: WIDTH, height: HEIGHT, fontFamily: 'var(--brand-font, sans-serif)'}}
      errorFallback={({error: caught}) => { error = caught; return <div>{String(caught)}</div>; }}/>));
    if (error) throw error;
    await document.fonts.ready;
    identify();
    // The poster only goes away once there is a committed frame behind it.
    document.getElementById('boot')?.remove();
  })();
  let tail = Promise.resolve();
  host.film = {
    width: WIDTH, height: HEIGHT, duration: duration / FPS, ready,
    frame(t) {
      if (!Number.isFinite(t)) return Promise.reject(new TypeError('Scene time must be finite'));
      const task = tail.then(async () => {
        await ready;
        const target = offset + Math.max(0, Math.min(duration - 1, Math.floor(t * FPS + 1e-6)));
        flushSync(() => player.current!.seekTo(target));
        if (error) throw error;
        if (committed !== target) throw new Error(`Frame not committed: ${committed}, expected ${target}`);
        identify();
        await Promise.all([...document.images].map(img => img.decode().catch(() => { throw new Error(`Image failed: ${img.src}`); })));
        await document.fonts.ready;
        await settle();
      });
      // Reject this request, but still allow a later seek past a bad frame.
      tail = task.catch(() => {});
      return task;
    },
  };
  // OpenFilm owns the only playback clock.
}

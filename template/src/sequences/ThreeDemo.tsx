// The 3D track's smoke test.
//
// Its only job is to prove that the WebGL path works end to end on this machine:
// `@remotion/three` + ANGLE + a procedural mesh renders a non-black frame. If
// `npm run check` passes but this composition comes out blank, the problem is
// the renderer, not your film — see docs/06-渲染导出.md.
//
// Replace it with a real 3D beat, or delete it once your own 3D composition
// exists. Keeping one trivial WebGL composition around is cheap insurance when
// a driver update lands.

import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, SAFE, SPACE} from '../theme';
import {VIDEO} from '../timeline';
import {timecode} from '../lib/format';

/** Length of this composition, in frames. `compositions.ts` registers it. */
export const THREE_DEMO_DURATION = 150;
import {Stage} from '../three/Stage';
import {Spinner} from '../three/Spinner';
import {Kicker, Micro} from '../components/Typography';

export const ThreeDemo = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{background: C.surfaceAlt}}>
      <ThreeCanvas
        width={VIDEO.WIDTH}
        height={VIDEO.HEIGHT}
        gl={{antialias: true}}
        camera={{fov: 32, position: [0, 0.5, 5.2], near: 0.1, far: 100}}
      >
        <Stage />
        <Spinner />
      </ThreeCanvas>

      {/* HUD layer: plain DOM on top of the canvas, which is how the 3D projects
          in this family put dashboards over a rendered scene. */}
      <AbsoluteFill
        style={{
          padding: `${SAFE.top}px ${SAFE.right}px ${SAFE.bottom}px ${SAFE.left}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}
      >
        <div>
          <Kicker>WEBGL SMOKE TEST</Kicker>
          <div
            style={{
              marginTop: SPACE.sm,
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: C.text,
            }}
          >
            3D 渲染自检
          </div>
        </div>
        <Micro style={{fontVariantNumeric: 'tabular-nums'}}>
          frame {frame} · {timecode(frame, VIDEO.FPS)} /{' '}
          {timecode(THREE_DEMO_DURATION, VIDEO.FPS)} · angle · h264
        </Micro>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

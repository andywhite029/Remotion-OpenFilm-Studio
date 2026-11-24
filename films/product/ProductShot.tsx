// One product shot: a real GLB on a turntable, driven by the frame number.
//
// The four parameters (`model` / `title` / `speed` / `distance`) arrive as
// props. The model is already loaded and decoded by the adapter, so this
// component is fully synchronous — which is what makes a mid-timeline seek in
// Studio show a finished product on the very first painted frame.
//
// The HUD is plain DOM over the canvas. Its text carries stable ids, so an
// editor can change the headline in Studio without touching the source.

import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {
  C,
  FONT_MONO,
  FONT_SANS,
  SAFE,
  SPACE,
  TRACK,
  TYPE,
} from '../../template/src/theme';
import {VIDEO} from '../../template/src/timeline';
import {progress} from '../../template/src/lib/format';
import {MODELS} from './models';
import {ProductModel, PRODUCT_HEIGHT} from './ProductModel';
import {ProductStage} from './ProductStage';
import type {LoadedModel} from './load-model';
import type {Shot} from './shot';

/** Frames the HUD takes to settle. Named, so no bare frame number is buried. */
const HUD_IN = 12;

type ProductShotProps = {
  shot: Shot;
  model: LoadedModel;
};

export const ProductShot = ({shot, model}: ProductShotProps) => {
  const frame = useCurrentFrame();
  const spec = MODELS[shot.model];

  // Frame → angle. A seek to 3.4 s renders exactly what playback to 3.4 s would;
  // nothing accumulates across frames.
  const angle = (frame / VIDEO.FPS) * shot.speed * (Math.PI / 180);
  const hud = progress(frame, 0, HUD_IN);

  return (
    <AbsoluteFill
      style={{
        // Paper ground: the same token the native title card uses, so the cut
        // between the two shots does not shift the white.
        background: `radial-gradient(120% 90% at 50% 38%, ${C.surface} 0%, ${C.canvas} 74%)`,
        fontFamily: FONT_SANS,
        color: C.text,
      }}
    >
      <ThreeCanvas
        width={VIDEO.WIDTH}
        height={VIDEO.HEIGHT}
        shadows="soft"
        dpr={1}
        gl={{antialias: true, alpha: true}}
        camera={{
          fov: 30,
          position: [0, 0.1, shot.distance],
          near: 0.1,
          far: 40,
        }}
      >
        <ProductStage />
        <ProductModel model={model} angle={angle} />
      </ThreeCanvas>

      <AbsoluteFill id="product-hud" style={{pointerEvents: 'none'}}>
        {/* Headline block. The title is a parameter and also a Studio override
            target (`#product-title`). */}
        <div
          style={{
            position: 'absolute',
            left: SAFE.left,
            top: SAFE.top,
            maxWidth: 1120,
            opacity: hud,
            transform: `translateY(${(1 - hud) * 14}px)`,
          }}
        >
          <div
            id="product-kicker"
            style={{
              fontFamily: FONT_MONO,
              fontSize: TYPE.micro,
              letterSpacing: TRACK.caps,
              textTransform: 'uppercase',
              color: C.accent,
            }}
          >
            Product shot / 3D
          </div>
          <div
            id="product-title"
            style={{
              marginTop: SPACE.md,
              fontSize: TYPE.display,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: TRACK.display,
              color: C.text,
            }}
          >
            {shot.title}
          </div>
          <div
            id="product-caption"
            style={{
              marginTop: SPACE.md,
              fontSize: TYPE.body,
              color: C.textSecondary,
            }}
          >
            {spec.label} · {spec.spec}
          </div>
        </div>

        {/* Readout of two of the four parameters, so a reviewer can see what
            the shot was generated from. */}
        <div
          style={{
            position: 'absolute',
            right: SAFE.right,
            top: SAFE.top,
            textAlign: 'right',
            fontFamily: FONT_MONO,
            fontSize: TYPE.micro,
            lineHeight: 1.9,
            letterSpacing: TRACK.caps,
            color: C.textTertiary,
            opacity: hud,
          }}
        >
          <div id="product-index">02 / 03</div>
          <div id="product-speed">TURN {shot.speed}°/s</div>
          <div id="product-distance">CAM {shot.distance}m</div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: SAFE.left,
            bottom: SAFE.bottom,
            display: 'flex',
            alignItems: 'center',
            gap: SPACE.md,
            opacity: hud,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: C.accent,
            }}
          />
          <span
            id="product-note"
            style={{
              fontFamily: FONT_MONO,
              fontSize: TYPE.micro,
              letterSpacing: TRACK.caps,
              textTransform: 'uppercase',
              color: C.textTertiary,
            }}
          >
            {PRODUCT_HEIGHT.toFixed(1)}u turntable · GLB · h264
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

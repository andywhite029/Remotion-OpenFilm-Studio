// The stage the product stands on.
//
// The stage is deliberately transparent: the paper ground is the DOM layer
// behind the canvas, so it is exactly the theme's `canvas` token instead of a
// tone-mapped WebGL colour, and the cut from the native title card does not
// shift white. Only the contact shadow is WebGL.
//
// The environment is procedural (`RoomEnvironment` → PMREM), so metals have
// something to reflect without downloading an HDR. It is baked once per canvas
// and never animated, which keeps every frame a pure function of its number.

import {useLayoutEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {PMREMGenerator} from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {C} from '../../template/src/theme';
import {FLOOR_Y} from './ProductModel';

const StudioEnvironment = () => {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useLayoutEffect(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.6;
    (room as {dispose?: () => void}).dispose?.();
    generator.dispose();
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
    };
  }, [gl, scene]);

  return null;
};

export const ProductStage = () => (
  <>
    <StudioEnvironment />
    {/* Warm key from upper right, cool violet rim from behind-left: the same
        two-tier lighting law as `template/src/three/Stage.tsx`. */}
    <ambientLight intensity={0.35} />
    <directionalLight
      position={[4.5, 6, 4]}
      intensity={2.4}
      castShadow
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      shadow-bias={-0.0004}
      shadow-camera-near={0.5}
      shadow-camera-far={20}
    />
    <directionalLight position={[-5, 2.5, -3]} intensity={1.4} color={C.accentBright} />
    <hemisphereLight args={[C.surface, C.canvas, 0.6]} />

    {/* Shadow catcher only: the paper ground is the DOM layer, so the plane
        must not paint anything opaque. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <shadowMaterial transparent opacity={0.16} />
    </mesh>
  </>
);

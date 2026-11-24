// A rotating object, driven purely by the frame number.
//
// This is the 3D equivalent of `FadeIn`: `useCurrentFrame()` in, transform out.
// No `useFrame` accumulator, no delta time, no `useState`. If you ever need
// per-frame accumulation, compute it from the frame instead — otherwise a
// parallel render will hand you different pictures for the same frame number.

import {useCurrentFrame} from 'remotion';
import {C} from '../theme';

export const Spinner = () => {
  const frame = useCurrentFrame();
  const turn = frame * 0.012; // ~2.2 s per revolution at 30 fps

  return (
    <group rotation={[0.38, turn, 0.12]}>
      <mesh>
        {/* args: [radius, tube, tubularSegments, radialSegments] */}
        <torusKnotGeometry args={[1, 0.3, 200, 28]} />
        <meshStandardMaterial
          color={C.accentBright}
          roughness={0.24}
          metalness={0.6}
        />
      </mesh>
    </group>
  );
};

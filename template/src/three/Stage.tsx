// Scene furniture for the 3D track: lights and a ground plane.
//
// Deliberately dependency-free — no drei, no HDR environment, no downloaded
// assets. A template's 3D example has to render on a machine with no network
// and no GPU driver heroics, otherwise the first thing a new project does is
// fail. Add `@react-three/drei` helpers per project, not here.
//
// Lights are warm key + cool fill, matching the two-tier colour law in
// docs/04-视觉规范.md: the scene is warm, the HUD that sits on top is paper.

import {C} from '../theme';

export const Stage = () => (
  <>
    {/* Base fill: enough to keep the shadow side readable, never flat white. */}
    <ambientLight intensity={0.55} />
    {/* Key light: upper right, front. */}
    <directionalLight position={[4, 6, 5]} intensity={2.4} />
    {/* Cool rim from behind-left; separates the object from the ground. */}
    <directionalLight
      position={[-5, 2.5, -4]}
      intensity={0.9}
      color={C.accentBright}
    />
    {/* A hint of bounce, so the underside is not a dead black hole. */}
    <hemisphereLight args={[C.surface, C.surfaceSunken, 0.5]} />

    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.35, 0]}>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial color={C.surfaceAlt} roughness={0.98} metalness={0} />
    </mesh>
  </>
);

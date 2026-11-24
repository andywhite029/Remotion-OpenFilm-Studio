// The Remotion root: it registers compositions and defines nothing else.
//
// If you are looking for the film, it is `sequences/Main.tsx`. If you are
// looking for where compositions are declared, it is `compositions.ts`.

import {Composition} from 'remotion';
import {COMPOSITIONS} from './compositions';

export const Root = () => (
  <>
    {COMPOSITIONS.map((spec) => (
      <Composition
        key={spec.id}
        id={spec.id}
        component={spec.component}
        durationInFrames={spec.durationInFrames}
        fps={spec.fps}
        width={spec.width}
        height={spec.height}
      />
    ))}
  </>
);

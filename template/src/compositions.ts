// The composition registry — the one place a new film is registered.
//
// `Root.tsx` renders whatever is in here, so adding a composition means adding
// one import and one object, never touching the root. `scripts/new-composition.mjs`
// does exactly that for you (it inserts before the two markers below).
//
// Keep this file free of logic: it is a table, and everything it points at owns
// its own behaviour.

import {type FC} from 'react';
import {Main} from './sequences/Main';
import {ThreeDemo, THREE_DEMO_DURATION} from './sequences/ThreeDemo';
import {VIDEO} from './timeline';
// @new-composition-import

export type CompositionSpec = {
  /** Shown in Studio and used as the CLI argument: `remotion render <id>`. */
  id: string;
  component: FC;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
};

export const COMPOSITIONS: readonly CompositionSpec[] = [
  {
    id: 'Main',
    component: Main,
    durationInFrames: VIDEO.DURATION,
    fps: VIDEO.FPS,
    width: VIDEO.WIDTH,
    height: VIDEO.HEIGHT,
  },
  {
    id: 'ThreeDemo',
    component: ThreeDemo,
    durationInFrames: THREE_DEMO_DURATION,
    fps: VIDEO.FPS,
    width: VIDEO.WIDTH,
    height: VIDEO.HEIGHT,
  },
  // @new-composition
];

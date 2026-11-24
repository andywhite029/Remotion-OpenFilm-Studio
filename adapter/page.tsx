import {Main, StudioBeat} from '../template/src/sequences/Main';
import {VIDEO, SEG, type SegId} from '../template/src/timeline';
import {mountScene} from './mount-scene';

const scene = document.documentElement.dataset.scene || 'main';
const beat = Object.hasOwn(SEG, scene) ? scene as SegId : null;
if (!beat && scene !== 'main') throw new Error(`Unknown Remotion scene: ${scene}`);
const offset = beat ? SEG[beat].from : 0;
mountScene({
  scene, offset, duration: beat ? SEG[beat].to - offset : VIDEO.DURATION,
  total: VIDEO.DURATION, video: VIDEO,
  Content: beat ? () => <StudioBeat id={beat}/> : Main,
});

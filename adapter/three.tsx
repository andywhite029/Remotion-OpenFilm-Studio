import {ThreeDemo, THREE_DEMO_DURATION} from '../template/src/sequences/ThreeDemo';
import {VIDEO} from '../template/src/timeline';
import {mountScene} from './mount-scene';

mountScene({scene: 'three', offset: 0, duration: THREE_DEMO_DURATION,
  total: THREE_DEMO_DURATION, video: VIDEO, Content: ThreeDemo});

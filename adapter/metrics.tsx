// The spec chart: pure DOM/SVG, no WebGL, no async assets.

import {Metrics, METRICS_DURATION} from '../films/product/Metrics';
import {VIDEO} from '../template/src/timeline';
import {mountScene} from './mount-scene';

mountScene({
  scene: 'metrics',
  offset: 0,
  duration: METRICS_DURATION,
  total: METRICS_DURATION,
  video: VIDEO,
  Content: Metrics,
});

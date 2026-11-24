// Entry point. `registerRoot` is what Remotion's bundler looks for; the path is
// pinned in `remotion.config.ts` (`Config.setEntryPoint('src/index.ts')`), so it
// is also what every CLI command uses without being told.
import {registerRoot} from 'remotion';
import {Root} from './Root';

registerRoot(Root);

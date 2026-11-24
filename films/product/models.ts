// The models a product shot can choose from.
//
// A TS table rather than JSON: `scripts/product-shot.mjs` and `scripts/build.mjs`
// import this file through Node's type stripping, and Node cannot load JSON from
// a `.ts` module without import attributes. Adding a model is one entry here plus
// the GLB in `assets/models/` — the shot code never names a model.

export const MODELS = {
  boombox: {
    file: 'models/boombox.glb',
    label: 'BOOMBOX',
    spec: '60W 双声道 · 18 小时续航',
  },
  'water-bottle': {
    file: 'models/water-bottle.glb',
    label: 'AQUA',
    spec: '316 不锈钢 · 750ml',
  },
} as const;

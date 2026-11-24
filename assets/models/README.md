# Product models (GLB)

Two real GLBs, used by the product shot in `films/product`. They are committed
here so a clone can render offline — a product shot that needs a CDN is not
reproducible.

| File | Model | Source | Licence |
|---|---|---|---|
| `boombox.glb` | BoomBox | [Khronos glTF-Sample-Assets · BoomBox](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BoomBox) | CC BY 4.0, © Microsoft |
| `water-bottle.glb` | WaterBottle | [Khronos glTF-Sample-Assets · WaterBottle](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/WaterBottle) | CC0 1.0 (public domain) |

## Why the committed files are smaller than upstream

Upstream packages 2048² PNG textures with `glTF Tools for Unity` (10.6 MB and
8.9 MB). Both files here were re-encoded: every embedded image is resized to
1024² and, where it has no real alpha, written as baseline JPEG. Geometry,
materials, extensions and node names are untouched, and no mesh compression is
applied — so the renderer needs no Draco/Meshopt/KTX2 decoder and the files stay
readable in any glTF viewer.

`BoomBox.glb`: 10.6 MB → 465 KB. `WaterBottle.glb`: 8.9 MB → 332 KB.

The re-encoder is intentionally not part of the build: the committed GLBs are
the source of truth, and re-deriving them is a one-off. If a model is replaced,
shrink it the same way and update this table.

## Normalisation

The scene does not hardcode a model's size or origin. `films/product/ProductModel.tsx`
measures the loaded bounding box, scales its height to 1.5 scene units, centres
it on the turntable and stands the bottom on the floor. That is what lets
`model` be a parameter rather than a code change.

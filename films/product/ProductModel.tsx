// The product, normalised onto the turntable.
//
// Nothing here knows which GLB it is: the bounding box is measured at load time
// and re-scaled, so `model` stays a data parameter. The rotation is computed by
// the parent from the frame number — never accumulated, never from a clock.

import {useMemo} from 'react';
import {
  Box3,
  Mesh,
  Vector3,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import type {LoadedModel} from './load-model';

/** Height of the normalised product, in scene units. Everything frames off it. */
export const PRODUCT_HEIGHT = 1.5;
/** The turntable surface: the model's bottom sits here. */
export const FLOOR_Y = -PRODUCT_HEIGHT / 2;

/**
 * Deep-clone the loaded scene so two shots of the same model cannot mutate each
 * other, then centre and scale it. Shadows are enabled per mesh because a GLB
 * never carries that flag.
 */
function prepare(source: Object3D): Object3D {
  const object = source.clone(true);
  object.updateMatrixWorld(true);

  const size = new Box3().setFromObject(object).getSize(new Vector3());
  const scale = PRODUCT_HEIGHT / Math.max(size.y, 1e-4);
  object.scale.setScalar(scale);
  object.updateMatrixWorld(true);

  // Centre the scaled bounding box on the turntable's axis.
  const centre = new Box3().setFromObject(object).getCenter(new Vector3());
  object.position.sub(centre);

  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      // The GLB ships metalness/roughness maps; a little extra environment
      // response is what makes metal read as metal on a light stage.
      (material as MeshStandardMaterial & {envMapIntensity: number})
        .envMapIntensity = 1.15;
    }
  });

  return object;
}

type ProductModelProps = {
  model: LoadedModel;
  /** Turntable angle in radians, already derived from the frame. */
  angle: number;
};

export const ProductModel = ({model, angle}: ProductModelProps) => {
  const scene = useMemo(() => prepare(model.scene), [model]);
  return (
    <group position={[0, 0, 0]} rotation={[0, angle, 0]}>
      <primitive object={scene} />
    </group>
  );
};

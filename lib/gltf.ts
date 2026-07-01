import * as THREE from "three"

// Recentre + uniformly scale a clone of a GLTF scene so its largest dimension
// equals `target`. Scale/rotation must be applied by a WRAPPING group at
// render time, never on the returned object itself — T·R·S composition means
// mutating rotation/scale on the same object you just recentred warps the
// translation.
export function recentre(scene: THREE.Object3D, target: number) {
  const clone = scene.clone(true)
  const bbox = new THREE.Box3().setFromObject(clone)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  bbox.getSize(size)
  bbox.getCenter(center)
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const s = target / maxDim
  clone.position.sub(center)
  return { object: clone, scale: s, size }
}

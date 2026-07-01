import * as THREE from "three"

// The board's LED matrix sits ~8mm behind the enclosure's front face, whose
// window is a moulded (solid, not through-hole) dot pattern — so with normal
// depth testing the LEDs are fully hidden behind solid material. Every scene
// that shows the assembled cube floats the led_on mesh forward onto that
// front surface by this amount (model units / mm) so it reads as the lit
// window: glowing from the front, still occluded from behind (no clip).
export const LED_FORWARD_MM = 8

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

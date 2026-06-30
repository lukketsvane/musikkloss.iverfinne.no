"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { PostFx } from "@/components/PostFx"

const MODEL_URL = "/microbit_cube.glb"
const HERO_YAW = -0.42 // same resting orientation as the hero cube — reads as the same object
const SIZE = 1.7 // normalised model size, in this scene's own world units

// A slow, gentle brightening of the lit LEDs — literally shows "glør gjennom
// eit 1,2 mm skin": more lamp than screen, not an animated graphic.
const PULSE_SPEED = 0.7
const PULSE_MIN = 0.55
const PULSE_MAX = 1.5

function LedRig() {
  const gltf = useGLTF(MODEL_URL)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const ledMat = useRef<THREE.MeshStandardMaterial | null>(null)

  // Clone and recentre the model on the origin (in its own, still-unscaled,
  // still-unrotated space) — scale and yaw are applied by the WRAPPING group at
  // render time, never on `clone` itself, so the recentre translation isn't
  // warped by a transform composed after it (T then R then S — mutating R/S on
  // the same object you just recentred shifts its world position).
  const { object, groupScale, groupY, ledCenter, shadowSpan } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    const bbox = new THREE.Box3().setFromObject(clone)
    const dims = new THREE.Vector3()
    const center = new THREE.Vector3()
    bbox.getSize(dims)
    bbox.getCenter(center)
    const maxDim = Math.max(dims.x, dims.y, dims.z) || 1
    const s = SIZE / maxDim
    clone.position.sub(center) // recentre only — clone's own rotation/scale stay identity

    const ledBox = new THREE.Box3()
    let any = false
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (mesh.name === "led_on" || mesh.name === "led_off") {
        const mat = mesh.material as THREE.MeshStandardMaterial
        mesh.material = mat.clone() // animate independently of the hero's material
        if (mesh.name === "led_on") ledMat.current = mesh.material as THREE.MeshStandardMaterial
        const b = new THREE.Box3().setFromObject(mesh)
        if (!any) {
          ledBox.copy(b)
          any = true
        } else {
          ledBox.union(b)
        }
      }
    })
    const ledLocalCenter = new THREE.Vector3()
    if (any) ledBox.getCenter(ledLocalCenter)

    // a pure Y-axis yaw never changes the Y extent, so the half-height computed
    // from the (still axis-aligned) recentred bbox is exactly the group's lift
    const halfHeight = (dims.y * s) / 2
    const groupY = halfHeight

    // manually carry the LED patch's local centre through the same transform the
    // wrapping group will apply (scale, then yaw, then lift) to get its true
    // world position for the camera rig — without needing a ref + layout pass
    const ledCenter = ledLocalCenter
      .clone()
      .multiplyScalar(s)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), HERO_YAW)
      .add(new THREE.Vector3(0, groupY, 0))

    return { object: clone, groupScale: s, groupY, ledCenter, shadowSpan: SIZE * 0.9 }
  }, [gltf.scene])

  useFrame(() => {
    if (!ledMat.current) return
    const t = performance.now() / 1000
    const k = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 + 0.5 * Math.sin(t * PULSE_SPEED))
    ledMat.current.emissiveIntensity = k
  })

  // frame on the LED face: look from outside the cube, through the LED patch's
  // own centre, at a near-eye-level elevation (a macro product shot, not a
  // steep top-down crop that fills the frame with floor instead of the grid)
  useMemo(() => {
    const aspect = size.width / size.height
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = 25
    cam.aspect = aspect
    const dirXZ = new THREE.Vector3(ledCenter.x, 0, ledCenter.z)
    if (dirXZ.lengthSq() < 1e-6) dirXZ.set(0, 0, 1)
    dirXZ.normalize()
    const elevation = THREE.MathUtils.degToRad(13)
    const distance = 3.15
    cam.position.set(
      ledCenter.x + dirXZ.x * distance * Math.cos(elevation),
      ledCenter.y + distance * Math.sin(elevation),
      ledCenter.z + dirXZ.z * distance * Math.cos(elevation),
    )
    cam.up.set(0, 1, 0)
    cam.near = 0.05
    cam.far = 20
    cam.lookAt(ledCenter.x, ledCenter.y, ledCenter.z)
    cam.updateProjectionMatrix()
  }, [camera, size, ledCenter])

  return (
    <>
      <ambientLight intensity={0.55} color="#fff3e3" />
      <directionalLight
        position={[-1.2, 2.4, -0.6]}
        intensity={2.2}
        color="#fff0d8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-shadowSpan, shadowSpan, shadowSpan, -shadowSpan, 0.1, 8]} />
      </directionalLight>
      <directionalLight position={[1.2, 0.8, 1]} intensity={0.45} color="#bcd2ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#e3dfd4" roughness={1} metalness={0} />
      </mesh>

      <group position={[0, groupY, 0]} rotation={[0, HERO_YAW, 0]} scale={groupScale}>
        <primitive object={object} dispose={null} />
      </group>
    </>
  )
}

export default function LedDetail() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping
      }}
    >
      <color attach="background" args={["#e9e6dd"]} />
      <Suspense fallback={null}>
        <LedRig />
      </Suspense>
      <PostFx />
    </Canvas>
  )
}

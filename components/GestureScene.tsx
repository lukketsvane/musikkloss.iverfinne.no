"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { recentre } from "@/lib/gltf"
import { PostFx } from "@/components/PostFx"

const MODEL_URL = "/microbit_cube.glb"
const SIZE = 1.55
const SENS = 0.011 // radians of turn/flip per pixel dragged
const DEADZONE = 6 // px before a drag locks to an axis
const TAP_PX = 8
const TAP_MS = 240
const COMMIT_DEG = 42 // past this, the drag commits a 90° step + fires an action
const EASE = 0.18

const WORLD_X = new THREE.Vector3(1, 0, 0)
const WORLD_Y = new THREE.Vector3(0, 1, 0)

// distance from the cube's centre down to the floor for a given (face-aligned)
// orientation, so it always rests ON the surface as it turns and tips rather
// than floating or sinking — the world-up axis expressed in the box's own
// frame, dotted against its half-extents.
function support(q: THREE.Quaternion, he: THREE.Vector3) {
  const up = WORLD_Y.clone().applyQuaternion(q.clone().invert())
  return Math.abs(up.x) * he.x + Math.abs(up.y) * he.y + Math.abs(up.z) * he.z
}

type Gestures = {
  isPlaying: boolean
  onTogglePlay: () => void
  onPlay: () => void
  onNext: () => void
  onPrev: () => void
}

function Rig({ isPlaying, onTogglePlay, onPlay, onNext, onPrev }: Gestures) {
  const gltf = useGLTF(MODEL_URL)
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const ledMat = useRef<THREE.MeshStandardMaterial | null>(null)
  const playing = useRef(isPlaying)
  playing.current = isPlaying

  // committed, always face-aligned orientation; the live pose eases toward the
  // preview (while dragging) or the committed rest (otherwise)
  const rest = useRef(new THREE.Quaternion())
  const live = useRef(new THREE.Quaternion())
  const drag = useRef<{
    x: number
    y: number
    axis: null | "turn" | "flip"
    t: number
    ang: number
  } | null>(null)

  const { object, scale, he } = useMemo(() => {
    const { object, scale, size: dims } = recentre(gltf.scene, SIZE)
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (mesh.name === "led_on") {
        mesh.castShadow = false
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        mat.depthTest = false
        mat.side = THREE.DoubleSide
        mesh.material = mat
        mesh.renderOrder = 10
        ledMat.current = mat
      }
    })
    return { object, scale, he: dims.clone().multiplyScalar(scale / 2) }
  }, [gltf.scene])

  useMemo(() => {
    const aspect = size.width / size.height
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = 32
    const halfV = Math.tan((cam.fov / 2) * (Math.PI / 180))
    const frame = Math.max(he.x, he.y, he.z) * 1.35
    const need = (frame * 1.05) / Math.min(1, aspect)
    const dist = need / halfV + 0.3
    const el = THREE.MathUtils.degToRad(20)
    cam.position.set(0, he.y + Math.sin(el) * dist, Math.cos(el) * dist)
    cam.up.set(0, 1, 0)
    cam.near = 0.1
    cam.far = 100
    cam.aspect = aspect
    cam.lookAt(0, he.y * 0.85, 0)
    cam.updateProjectionMatrix()
  }, [camera, size, he])

  // preview quaternion for the in-progress drag: a single-axis world rotation
  // layered on the committed rest pose
  const preview = (axis: "turn" | "flip", ang: number) => {
    const worldAxis = axis === "turn" ? WORLD_Y : WORLD_X
    return new THREE.Quaternion().setFromAxisAngle(worldAxis, ang).multiply(rest.current)
  }

  useFrame(() => {
    const g = group.current
    if (!g) return
    const d = drag.current
    const target = d && d.axis ? preview(d.axis, d.ang) : rest.current
    live.current.slerp(target, EASE)
    g.quaternion.copy(live.current)
    g.position.y = support(live.current, he)

    if (ledMat.current) {
      const now = performance.now() / 1000
      const lvl = playing.current ? 0.55 + 0.5 * (0.5 + 0.5 * Math.sin(now * 2.1)) : 0.15
      ledMat.current.emissiveIntensity += (lvl - ledMat.current.emissiveIntensity) * 0.08
    }
  })

  const onDown = (e: any) => {
    e.stopPropagation()
    e.target?.setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, axis: null, t: performance.now(), ang: 0 }
  }
  const onMove = (e: any) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.axis) {
      if (Math.hypot(dx, dy) < DEADZONE) return
      d.axis = Math.abs(dx) >= Math.abs(dy) ? "turn" : "flip"
    }
    // turn: drag right = +yaw; flip: drag down = tip forward (+pitch about world X)
    const px = d.axis === "turn" ? dx : dy
    d.ang = THREE.MathUtils.clamp(px * SENS, -Math.PI * 0.7, Math.PI * 0.7)
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const held = performance.now() - d.t
    if (!d.axis) {
      if (held < TAP_MS) onTogglePlay()
      return
    }
    const deg = THREE.MathUtils.radToDeg(d.ang)
    const step = Math.abs(deg) >= COMMIT_DEG ? Math.sign(deg) : 0
    if (step !== 0) {
      const worldAxis = d.axis === "turn" ? WORLD_Y : WORLD_X
      rest.current = new THREE.Quaternion()
        .setFromAxisAngle(worldAxis, (Math.PI / 2) * step)
        .multiply(rest.current)
      // map the committed step to a playback action, mirroring the product's
      // own vocabulary: turn right = play, turn left = skip; flip = prev/next
      if (d.axis === "turn") step > 0 ? onPlay() : onNext()
      else step > 0 ? onNext() : onPrev()
    }
  }

  return (
    <>
      <group
        ref={group}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <group scale={scale}>
          <primitive object={object} dispose={null} />
        </group>
      </group>

      <ambientLight intensity={0.75} color="#fff3e3" />
      <directionalLight
        position={[-2, 12, -1]}
        intensity={3.2}
        color="#fff0d8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0009}
        shadow-normalBias={0.045}
      >
        <orthographicCamera attach="shadow-camera" args={[-1.8, 1.8, 1.8, -1.8, 1, 30]} />
      </directionalLight>
      <directionalLight position={[6, 5, 4]} intensity={0.8} color="#bcd2ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#e3dfd4" roughness={1} metalness={0} />
      </mesh>
    </>
  )
}

export default function GestureScene(props: Gestures) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping
        gl.domElement.style.cursor = "grab"
      }}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={["#e9e6dd"]} />
      <Suspense fallback={null}>
        <Rig {...props} />
      </Suspense>
      <PostFx aoRadius={0.16} aoIntensity={0.9} />
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)

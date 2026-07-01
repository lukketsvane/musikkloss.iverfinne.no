"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { recentre, LED_FORWARD_MM } from "@/lib/gltf"
import { PostFx } from "@/components/PostFx"

const MODEL_URL = "/microbit_cube.glb"
const SIZE = 1.55
const SENS = 0.011 // radians of turn/flip per pixel dragged
const DEADZONE = 6 // px before a drag locks to an axis
const TAP_MS = 240
const COMMIT_DEG = 42 // past this, the drag commits a 90° step + fires an action
const EASE = 0.18

// a genuinely diagonal drag (neither mostly horizontal nor mostly vertical)
// tips the cube up onto its one rounded edge instead of turning/flipping —
// a distinct pose, toggled, not a 90° snap
const DIAG_MIN_DEG = 25 // drag angle from horizontal must fall in this band...
const DIAG_MAX_DEG = 65 // ...to count as diagonal rather than turn/flip
const BALANCE_DRAG_PX = 150 // px of diagonal drag for a full 0→1 preview
const BALANCE_COMMIT_T = 0.55
// The shell's rounded feature is a single edge (not a vertical corner) running
// along local Z, at local (+X, +Y) — measured directly off the mesh: every
// other corner has a real vertex within ~2mm of its ideal sharp-box position,
// but this one's nearest vertex is ~11-12mm away, i.e. the true surface there
// is a wide bevel, not a point. -133.3deg is the exact roll (about world Z)
// that aligns that corner's direction-from-centre with straight down.
const BALANCE_ROLL_DEG = -133.3
// generic per-frame grounding assumes a sharp box corner touches the floor;
// this corner doesn't have one (see above) — pull the object down by
// (roughly) the bevel's real depth so it doesn't float above its own surface
const BALANCE_CONTACT_INSET_MM = 11.5
const ROCK_AMPLITUDE = THREE.MathUtils.degToRad(2.2) // gentle "still balancing" wobble
const ROCK_SPEED = 1.3

const WORLD_X = new THREE.Vector3(1, 0, 0)
const WORLD_Y = new THREE.Vector3(0, 1, 0)
const WORLD_Z = new THREE.Vector3(0, 0, 1)
const IDENTITY_Q = new THREE.Quaternion()
const BALANCE_Q = new THREE.Quaternion().setFromAxisAngle(WORLD_Z, THREE.MathUtils.degToRad(BALANCE_ROLL_DEG))

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
  onBalanceChange: (balanced: boolean) => void
}

function Rig({ isPlaying, onTogglePlay, onPlay, onNext, onPrev, onBalanceChange }: Gestures) {
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
  const balanced = useRef(false)
  const drag = useRef<{
    x: number
    y: number
    axis: null | "turn" | "flip" | "balance"
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
        mat.emissiveIntensity = 12
        mesh.material = mat
        mesh.position.z += LED_FORWARD_MM
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

  // preview quaternion for the in-progress drag: turn/flip layer a single-axis
  // world rotation on the committed rest pose; balance slerps between the
  // upright and balanced poses proportional to how far the diagonal drag has
  // travelled (t: 0→1), toward whichever state the gesture is toggling to
  const preview = (axis: "turn" | "flip" | "balance", ang: number) => {
    if (axis === "balance") {
      const from = balanced.current ? BALANCE_Q : IDENTITY_Q
      const to = balanced.current ? IDENTITY_Q : BALANCE_Q
      return from.clone().slerp(to, THREE.MathUtils.clamp(ang, 0, 1))
    }
    const worldAxis = axis === "turn" ? WORLD_Y : WORLD_X
    return new THREE.Quaternion().setFromAxisAngle(worldAxis, ang).multiply(rest.current)
  }

  useFrame(() => {
    const g = group.current
    if (!g) return
    const d = drag.current
    let target = d && d.axis ? preview(d.axis, d.ang) : rest.current
    // how far into the balanced pose the live orientation is right now — 0 at
    // upright, 1 fully balanced — so the contact-point correction below can
    // fade in/out with the same drag that's driving the rotation itself
    let balanceBlend = balanced.current ? 1 : 0
    if (d && d.axis === "balance") {
      const t = THREE.MathUtils.clamp(d.ang, 0, 1)
      balanceBlend = balanced.current ? 1 - t : t
    }
    // a small continuous rock while resting balanced — it reads as still
    // finding its footing on the curve rather than a frozen prop
    if (!d && balanced.current) {
      const wobble = Math.sin((performance.now() / 1000) * ROCK_SPEED) * ROCK_AMPLITUDE
      target = new THREE.Quaternion().setFromAxisAngle(WORLD_X, wobble).multiply(target)
    }
    live.current.slerp(target, EASE)
    g.quaternion.copy(live.current)
    // the balanced corner has no sharp box vertex in reality (it's a wide
    // bevel) — support() alone would rest the object on that phantom ideal
    // point, hovering it above where its actual rounded surface is
    g.position.y = support(live.current, he) - BALANCE_CONTACT_INSET_MM * scale * balanceBlend

    if (ledMat.current) {
      const now = performance.now() / 1000
      const lvl = playing.current ? 8 + 6 * (0.5 + 0.5 * Math.sin(now * 2.1)) : 3
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
      const angleFromHorizontal = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(dy), Math.abs(dx)))
      if (angleFromHorizontal > DIAG_MIN_DEG && angleFromHorizontal < DIAG_MAX_DEG) {
        d.axis = "balance"
      } else {
        d.axis = Math.abs(dx) >= Math.abs(dy) ? "turn" : "flip"
      }
    }
    if (d.axis === "balance") {
      d.ang = THREE.MathUtils.clamp(Math.hypot(dx, dy) / BALANCE_DRAG_PX, 0, 1.15)
    } else {
      // turn: drag right = +yaw; flip: drag down = tip forward (+pitch about world X)
      const px = d.axis === "turn" ? dx : dy
      d.ang = THREE.MathUtils.clamp(px * SENS, -Math.PI * 0.7, Math.PI * 0.7)
    }
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
    if (d.axis === "balance") {
      if (d.ang >= BALANCE_COMMIT_T) {
        balanced.current = !balanced.current
        rest.current = balanced.current ? BALANCE_Q.clone() : IDENTITY_Q.clone()
        onBalanceChange(balanced.current)
      }
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

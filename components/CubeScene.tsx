"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import {
  CuboidCollider,
  Physics,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { buildWalls, type Box, FLOOR, WALL_COL_HEIGHT } from "@/lib/layout"
import { PostFx } from "@/components/PostFx"

const MODEL_URL = "/microbit_cube.glb"
const BOARD_URL = "/microbit_board.glb"
const DRACO_PATH = "/draco/"

const G = 22 // gravity strength
const SIZE = 1.4 // cube's largest dimension, as a multiple of the framed half-width
const HERO_YAW = -0.42 // resting yaw that presents the speaker face + rounded top

// rapier RigidBodyType values (Dynamic / KinematicPositionBased) — frozen in
// place while exploded so parts can fly apart without gravity/throws fighting it
const BODY_DYNAMIC = 0
const BODY_KINEMATIC_POSITION = 2

// how far each part flies apart at full explode (scaled by `half` so it stays
// proportional across screen sizes), in the model's own recentred local space
const EXPLODE_SHELL_Y = 0.85
const EXPLODE_BASE_Y = -0.7
const EXPLODE_BOARD_Y = 0.42
const EXPLODE_BOARD_Z = 3.4
const EXPLODE_EASE = 0.09

// drag / carry servo constants (ported from the klossete engine)
const GRAB_RATE = 9
const GRAB_RESPONSE = 0.35
const MAX_DRAG_SPEED = 7
const THROW_MAX = 5.0
const MIN_LIFT = 1.1
const TAP_TIME = 0.2
const TAP_MOVE = 0.25
const TWIST_EASE = 0.2
const TWIST_MAX_RATE = 2.6

// visible half-width of the floor we frame. Phones tighter so the cube reads big.
function viewHalf(w: number, h: number) {
  const min = Math.min(w, h)
  if (min < 520) return 1.7
  if (min < 820) return 2.0
  return 2.2
}

function useViewHalf() {
  const [half, setHalf] = useState(2.2)
  useEffect(() => {
    const update = () => setHalf(viewHalf(window.innerWidth, window.innerHeight))
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  return half
}

// Angled hero camera: looks down at the origin from the front so the cube's
// rounded top and the speaker face both read. The cube is centred, so it is
// always in frame — framed tight so the cube reads big.
function CameraRig({ half, explode }: { half: number; explode: boolean }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const fov = 32
    const halfV = Math.tan((fov / 2) * (Math.PI / 180))
    // breathing room so the cube + its shadow never crowd the frame edge —
    // wider once exploded, since the parts spread well beyond the resting silhouette
    const margin = explode ? 3.2 : 1.28
    const need = (half * margin) / Math.min(1, aspect) // frame ±half (+margin)
    const dist = need / halfV + 0.3
    const el = THREE.MathUtils.degToRad(33) // 0 = side-on, 90 = top-down — a calmer, more level product angle
    cam.fov = fov
    cam.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist)
    cam.up.set(0, 1, 0)
    cam.near = 0.1
    cam.far = 400
    cam.aspect = aspect
    cam.lookAt(0, half * 0.22, 0)
    cam.updateProjectionMatrix()
  }, [camera, size, half, explode])
  return null
}

type CubeHandle = { radius: number }

// Recentre + uniformly scale a clone of a GLTF scene so its largest dimension
// equals `target`. Shared by the cube body and the real board model so both
// go through the exact same (translate-then-scale-via-parent-group) math —
// mutating rotation/scale on the same object you just recentred warps the
// translation (T·R·S composition), so callers apply scale/rotation on a
// WRAPPING group, never on the returned object itself.
function recentre(scene: THREE.Object3D, target: number) {
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

function Cube({
  half,
  explodeTarget,
  onGrab,
}: {
  half: number
  explodeTarget: boolean
  onGrab: (body: RapierRigidBody, point: THREE.Vector3, h: CubeHandle) => void
}) {
  const gltf = useGLTF(MODEL_URL)
  const boardGltf = useGLTF(BOARD_URL, DRACO_PATH)

  // Pull the named parts (shell / base / board placeholder / led_on) out of
  // the cube clone so each can be offset independently for the exploded view.
  // Each part is re-parented into a NEW group structure below (so it can be
  // animated independently) — re-parenting drops it out of the original
  // "world" wrapper, so the whole-assembly recentre offset has to be applied
  // directly to each part's own position, not to a shared ancestor.
  const { parts, meshScale, halfExtents } = useMemo(() => {
    const root = gltf.scene.clone(true)
    const bbox = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    bbox.getSize(size)
    bbox.getCenter(center)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const s = (half * SIZE) / maxDim

    // shell/base/board/led_on may sit a level or two below the cloned root
    // (the GLB's nodes nest under a "world" group) — traverse, don't assume
    // they're direct children, and match by their exact authored node names.
    const found: Record<string, THREE.Object3D> = {}
    const NAMES = new Set(["shell", "base", "board", "led_on"])
    root.traverse((child) => {
      if (NAMES.has(child.name) && !found[child.name]) found[child.name] = child
    })
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      // the lit LED dots sit recessed in the shell, where screen-space AO
      // darkens them despite being emissive — boost + don't self-shadow them
      // so they read clearly instead of disappearing into the crevice shading
      if (mesh.name === "led_on") {
        mesh.castShadow = false
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        mat.emissiveIntensity = 9
        mat.depthTest = false
        mat.side = THREE.DoubleSide
        mesh.material = mat
        mesh.renderOrder = 10
      }
    })
    // recentre each extracted part directly (see note above)
    Object.values(found).forEach((part) => part.position.sub(center))

    const he = size.clone().multiplyScalar(s / 2)
    return { parts: found, meshScale: s, halfExtents: he }
  }, [gltf.scene, half])

  // The real, downloaded micro:bit board — normalised to a legible size (not
  // forced to the tiny placeholder footprint, which is just an abstracted
  // stand-in) and revealed only once the cube is pulled apart.
  const board = useMemo(() => {
    const { object, scale: s } = recentre(boardGltf.scene, half * SIZE * 0.78)
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    return { object, scale: s }
  }, [boardGltf.scene, half])

  const ref = useRef<RapierRigidBody>(null)
  const handle: CubeHandle = useMemo(
    () => ({ radius: Math.hypot(halfExtents.x, halfExtents.z) }),
    [halfExtents],
  )
  // Sit the cube flat on the floor at a clean hero angle — no drop-in tumble, so
  // the default pose is always the same flattering 3/4 (not a random rolled rest).
  const spawnY = halfExtents.y + 0.002

  const onPointerDown = (e: any) => {
    e.stopPropagation()
    if (!ref.current || explodeTarget) return
    onGrab(ref.current, e.point.clone(), handle)
  }

  // freeze the body (kinematic, ignores gravity/collisions) while exploded so
  // parts can fly apart without the cube simultaneously tumbling or falling
  useEffect(() => {
    const body = ref.current
    if (!body) return
    if (explodeTarget) {
      body.setBodyType(BODY_KINEMATIC_POSITION, true)
    } else {
      body.setBodyType(BODY_DYNAMIC, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  }, [explodeTarget])

  const explode = useRef(0)
  const shellRef = useRef<THREE.Group>(null)
  const baseRef = useRef<THREE.Group>(null)
  const boardRef = useRef<THREE.Group>(null)

  useFrame(() => {
    const target = explodeTarget ? 1 : 0
    explode.current += (target - explode.current) * EXPLODE_EASE
    const e = explode.current
    // these groups sit OUTSIDE the meshScale-scaled geometry group (siblings,
    // not children of it) so the offsets are in final scene units — applying
    // them inside the scaled group would shrink the motion to almost nothing
    if (shellRef.current) shellRef.current.position.set(0, EXPLODE_SHELL_Y * half * e, 0)
    if (baseRef.current) baseRef.current.position.set(0, EXPLODE_BASE_Y * half * e, 0)
    if (boardRef.current) {
      boardRef.current.position.set(0, EXPLODE_BOARD_Y * half * e, EXPLODE_BOARD_Z * half * e)
      const k = THREE.MathUtils.smoothstep(e, 0.15, 0.65)
      boardRef.current.scale.setScalar(k)
    }
  })

  return (
    <RigidBody
      ref={ref}
      position={[0, spawnY, 0]}
      rotation={[0, HERO_YAW, 0]}
      colliders={false}
      friction={0.7}
      restitution={0.1}
      density={6}
      linearDamping={0.2}
      angularDamping={1.1}
      canSleep={false}
      ccd
    >
      <CuboidCollider args={[halfExtents.x, halfExtents.y, halfExtents.z]} />
      <group ref={shellRef} onPointerDown={onPointerDown}>
        <group scale={meshScale}>
          {parts.shell && <primitive object={parts.shell} dispose={null} />}
          {parts.led_on && <primitive object={parts.led_on} dispose={null} />}
        </group>
      </group>
      <group ref={baseRef} onPointerDown={onPointerDown}>
        <group scale={meshScale}>{parts.base && <primitive object={parts.base} dispose={null} />}</group>
      </group>
      <group ref={boardRef} scale={0}>
        <group scale={board.scale}>
          <primitive object={board.object} dispose={null} />
        </group>
      </group>
    </RigidBody>
  )
}

// Device-tilt → gravity. Off by default (the cube rests centred and framed).
// When on, the way you tilt the phone is the way the cube rolls. iOS needs a
// permission grant from a user gesture — handled in HeroStage before this mounts.
function TiltController({ tilt }: { tilt: boolean }) {
  const { world } = useRapier()
  const target = useRef({ beta: 0, gamma: 0 })
  const cur = useRef({ beta: 0, gamma: 0 })
  useEffect(() => {
    if (!tilt) return
    const onO = (e: DeviceOrientationEvent) => {
      target.current.beta = e.beta ?? 0
      target.current.gamma = e.gamma ?? 0
    }
    window.addEventListener("deviceorientation", onO)
    return () => window.removeEventListener("deviceorientation", onO)
  }, [tilt])
  useFrame(() => {
    if (!world) return
    if (!tilt) {
      world.gravity.x = 0
      world.gravity.y = -G
      world.gravity.z = 0
      return
    }
    cur.current.beta += (target.current.beta - cur.current.beta) * 0.12
    cur.current.gamma += (target.current.gamma - cur.current.gamma) * 0.12
    const b = THREE.MathUtils.clamp(cur.current.beta, -70, 70) * (Math.PI / 180)
    const g = THREE.MathUtils.clamp(cur.current.gamma, -70, 70) * (Math.PI / 180)
    const gx = Math.sin(g) // tilt right → roll right
    const gz = Math.sin(b) // tilt top away → roll back up-screen
    const gy = -Math.max(Math.cos(b) * Math.cos(g), 0.2) // always some pull to the floor
    const v = new THREE.Vector3(gx, gy, gz).normalize().multiplyScalar(G)
    world.gravity.x = v.x
    world.gravity.y = v.y
    world.gravity.z = v.z
  })
  return null
}

type DragState = {
  body: RapierRigidBody
  plane: THREE.Plane
  localAnchor: THREE.Vector3
  liftY: number
  baseLift: number
  grabTime: number
  startPos: THREE.Vector3
  radius: number
}

function Scene({ half, tilt, explode }: { half: number; tilt: boolean; explode: boolean }) {
  const { camera, gl } = useThree()
  const box: Box = useMemo(() => ({ bx: half * 1.04, bz: half * 1.04 }), [half])
  const colliderWalls = useMemo(() => buildWalls(box, WALL_COL_HEIGHT), [box])
  const shadowSpan = half * 2.2 // ortho shadow-camera half-extent, covers the floor

  const drag = useRef<DragState | null>(null)
  const twoFinger = useRef(false)
  const twist = useRef<{ base: THREE.Quaternion; start: number; delta: number } | null>(null)
  const pointerNdc = useRef(new THREE.Vector2())
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  // an explode toggle mid-drag would fight the kinematic freeze in Cube —
  // release the grab the moment explode engages
  useEffect(() => {
    if (explode) {
      drag.current = null
      twist.current = null
      twoFinger.current = false
    }
  }, [explode])

  const onGrab = (body: RapierRigidBody, point: THREE.Vector3, h: CubeHandle) => {
    gl.domElement.style.cursor = "grabbing"
    const ndc = point.clone().project(camera)
    pointerNdc.current.set(ndc.x, ndc.y)
    const t = body.translation()
    const r = body.rotation()
    const center = new THREE.Vector3(t.x, t.y, t.z)
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w)
    const localAnchor = point.clone().sub(center).applyQuaternion(q.clone().invert())
    const grabY = THREE.MathUtils.clamp(point.y, 0.2, half * 1.6)
    body.wakeUp()
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    drag.current = {
      body,
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -grabY),
      localAnchor,
      liftY: grabY,
      baseLift: grabY,
      grabTime: performance.now(),
      startPos: center.clone(),
      radius: h.radius,
    }
  }

  /* ---- pointer tracking + release ---- */
  useEffect(() => {
    const el = gl.domElement
    const setNdc = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      pointerNdc.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointerNdc.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    const onMove = (e: PointerEvent) => setNdc(e)
    const onUp = () => {
      const d = drag.current
      el.style.cursor = "grab"
      if (!d) return
      if (!d.body.isValid()) {
        drag.current = null
        twist.current = null
        twoFinger.current = false
        return
      }
      const held = (performance.now() - d.grabTime) / 1000
      const tp = d.body.translation()
      const moved = Math.hypot(tp.x - d.startPos.x, tp.z - d.startPos.z)
      if (held < TAP_TIME && moved < TAP_MOVE) {
        d.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        d.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      } else {
        const lv = d.body.linvel()
        const v = new THREE.Vector3(lv.x, lv.y, lv.z)
        if (v.length() > THROW_MAX) {
          v.setLength(THROW_MAX)
          d.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true)
        }
      }
      drag.current = null
      twist.current = null
      twoFinger.current = false
    }
    el.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      el.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [gl, camera])

  /* ---- two-finger twist (yaw the held cube) ---- */
  useEffect(() => {
    const el = gl.domElement
    const twoAngle = (e: TouchEvent) =>
      Math.atan2(
        e.touches[1].clientY - e.touches[0].clientY,
        e.touches[1].clientX - e.touches[0].clientX,
      )
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && drag.current) {
        twoFinger.current = true
        const r = drag.current.body.rotation()
        twist.current = { base: new THREE.Quaternion(r.x, r.y, r.z, r.w), start: twoAngle(e), delta: 0 }
      }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !drag.current || !twist.current) return
      twist.current.delta = -wrap(twoAngle(e) - twist.current.start)
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        twoFinger.current = false
        twist.current = null
      }
    }
    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: true })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [gl])

  /* ---- carry servo: hang the grabbed cube from the cursor ---- */
  useFrame((_s, delta) => {
    const d = drag.current
    if (!d) return
    if (!d.body.isValid()) {
      drag.current = null
      twist.current = null
      twoFinger.current = false
      return
    }
    const dt = THREE.MathUtils.clamp(delta, 1 / 240, 1 / 30)

    if (twoFinger.current) {
      const lv0 = d.body.linvel()
      d.body.setLinvel({ x: 0, y: lv0.y, z: 0 }, true)
      const tw = twist.current
      if (tw) {
        const r0 = d.body.rotation()
        const targetQ = new THREE.Quaternion()
          .setFromAxisAngle(new THREE.Vector3(0, 1, 0), tw.delta)
          .multiply(tw.base)
        const cur = new THREE.Quaternion(r0.x, r0.y, r0.z, r0.w)
        const ang = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(cur.dot(targetQ)), 0, 1))
        const maxStep = TWIST_MAX_RATE * dt
        const f = ang > 1e-4 ? Math.min(TWIST_EASE, maxStep / ang) : 1
        cur.slerp(targetQ, f)
        d.body.setRotation({ x: cur.x, y: cur.y, z: cur.z, w: cur.w }, true)
        d.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      }
      return
    }

    const held = (performance.now() - d.grabTime) / 1000
    const pickup = THREE.MathUtils.smoothstep(held, 0.18, 0.6)
    const targetLift = THREE.MathUtils.lerp(d.baseLift, MIN_LIFT, pickup)
    d.liftY += (targetLift - d.liftY) * 0.12
    d.plane.constant = -d.liftY

    raycaster.setFromCamera(pointerNdc.current, camera)
    const target = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(d.plane, target)) return
    const lx = Math.max(box.bx - d.radius, 0)
    const lz = Math.max(box.bz - d.radius, 0)
    target.x = THREE.MathUtils.clamp(target.x, -lx, lx)
    target.z = THREE.MathUtils.clamp(target.z, -lz, lz)
    target.y = d.liftY

    const t = d.body.translation()
    const r = d.body.rotation()
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w)
    const rWorld = d.localAnchor.clone().applyQuaternion(q)
    let dvx = (target.x - (t.x + rWorld.x)) * GRAB_RATE
    let dvy = (target.y - (t.y + rWorld.y)) * GRAB_RATE
    let dvz = (target.z - (t.z + rWorld.z)) * GRAB_RATE
    const dsp = Math.hypot(dvx, dvy, dvz)
    if (dsp > MAX_DRAG_SPEED) {
      const k = MAX_DRAG_SPEED / dsp
      dvx *= k
      dvy *= k
      dvz *= k
    }
    const lv = d.body.linvel()
    d.body.setLinvel(
      {
        x: lv.x + (dvx - lv.x) * GRAB_RESPONSE,
        y: lv.y + (dvy - lv.y) * GRAB_RESPONSE,
        z: lv.z + (dvz - lv.z) * GRAB_RESPONSE,
      },
      true,
    )
  })

  return (
    <>
      <CameraRig half={half} explode={explode} />
      <TiltController tilt={tilt} />

      {/* klossete-style lighting: a warm key light from the top casts a single
          hard shadow down-screen; a low cool fill keeps the dark side from
          going flat. N8AO (in PostFx) adds contact grounding — no second,
          separately-baked shadow technique sharing the same floor plane (that
          combination z-fought into a striped/banded artifact). Intensities run
          higher than the old model needed — this GLB's cobalt material is a
          noticeably darker baseColor, so it needs more light to read the same. */}
      <ambientLight intensity={0.75} color="#fff3e3" />
      <directionalLight
        position={[-3.5, 13, -2.5]}
        intensity={3.4}
        color="#fff0d8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0009}
        shadow-normalBias={0.045}
      >
        <orthographicCamera attach="shadow-camera" args={[-shadowSpan, shadowSpan, shadowSpan, -shadowSpan, 1, 40]} />
      </directionalLight>
      <directionalLight position={[6, 5, 4]} intensity={0.85} color="#bcd2ff" />

      {/* floor (receives the cast shadow) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR, FLOOR]} />
        <meshStandardMaterial color="#e3dfd4" roughness={1} metalness={0} />
      </mesh>

      {/* ground collider — top face sits exactly at y=0 so the cube rests on it */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[FLOOR / 2, 0.5, FLOOR / 2]} position={[0, -0.5, 0]} />
      </RigidBody>

      {/* invisible containment walls so a hard throw never leaves the frame */}
      {colliderWalls.map((w, i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={w.pos}>
          <CuboidCollider args={w.half} />
        </RigidBody>
      ))}

      <Suspense fallback={null}>
        <Cube half={half} explodeTarget={explode} onGrab={onGrab} />
      </Suspense>
    </>
  )
}

export default function CubeScene({ tilt = false, explode = false }: { tilt?: boolean; explode?: boolean }) {
  const half = useViewHalf()
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 6, 6], fov: 32, near: 0.1, far: 400 }}
      onCreated={({ gl }) => {
        // tone mapping is handled by the PostFx ToneMapping effect
        gl.toneMapping = THREE.NoToneMapping
        gl.domElement.style.cursor = "grab"
      }}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={["#e9e6dd"]} />
      <Physics gravity={[0, -G, 0]} timeStep={1 / 60} numSolverIterations={8} maxCcdSubsteps={2} interpolate>
        <Scene half={half} tilt={tilt} explode={explode} />
      </Physics>
      {/* a world-space AO radius this large relative to the hero's zoomed-out
          view crushes the recessed, emissive LED dots — use a much smaller one */}
      <PostFx aoRadius={0.16} aoIntensity={0.9} />
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)
useGLTF.preload(BOARD_URL, DRACO_PATH)

"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { recentre } from "@/lib/gltf"
import { PostFx } from "@/components/PostFx"

const MODEL_URL = "/microbit_cube.glb"
const SIZE = 1.55
const REST_YAW = -0.5
const SPRING_EASE = 0.14

// gesture thresholds — mirrors the product's own vocabulary ("vri han ein veg
// so spelar musikken; vri han ein annan so hoppar han vidare"): a short tap
// pauses/resumes, a real turn either starts playback or skips forward.
const TAP_TIME = 0.22
const TAP_MOVE = 14
const TURN_THRESHOLD = 0.4

function Rig({
  isPlaying,
  onTogglePlay,
  onPlay,
  onSkip,
}: {
  isPlaying: boolean
  onTogglePlay: () => void
  onPlay: () => void
  onSkip: () => void
}) {
  const gltf = useGLTF(MODEL_URL)
  const group = useRef<THREE.Group>(null)
  const yaw = useRef(REST_YAW)
  const drag = useRef<{ x: number; yaw: number; t: number; lastX: number } | null>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const ledMat = useRef<THREE.MeshStandardMaterial | null>(null)
  const playingRef = useRef(isPlaying)
  playingRef.current = isPlaying

  const { object, scale, halfHeight } = useMemo(() => {
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
    return { object, scale, halfHeight: (dims.y * scale) / 2 }
  }, [gltf.scene])

  useMemo(() => {
    const aspect = size.width / size.height
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = 30
    const halfV = Math.tan((cam.fov / 2) * (Math.PI / 180))
    const half = SIZE * 0.6
    const need = (half * 1.05) / Math.min(1, aspect)
    const dist = need / halfV + 0.2
    const el = THREE.MathUtils.degToRad(23)
    cam.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist)
    cam.up.set(0, 1, 0)
    cam.near = 0.1
    cam.far = 100
    cam.aspect = aspect
    cam.lookAt(0, halfHeight * 0.5, 0)
    cam.updateProjectionMatrix()
  }, [camera, size, halfHeight])

  useFrame(() => {
    if (!drag.current && group.current) {
      yaw.current += (REST_YAW - yaw.current) * SPRING_EASE
    }
    if (group.current) group.current.rotation.y = yaw.current

    // a slow breathing pulse on the lit LEDs while "playing" — the same
    // more-lamp-than-screen glow used elsewhere, tied to playback state
    // instead of running constantly
    if (ledMat.current) {
      const t = performance.now() / 1000
      const target = playingRef.current ? 0.55 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.1)) : 0.15
      ledMat.current.emissiveIntensity += (target - ledMat.current.emissiveIntensity) * 0.08
    }
  })

  const onDown = (e: any) => {
    e.stopPropagation()
    e.target?.setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, yaw: yaw.current, t: performance.now(), lastX: e.clientX }
  }
  const onMove = (e: any) => {
    if (!drag.current) return
    yaw.current = drag.current.yaw + (e.clientX - drag.current.x) * 0.012
    drag.current.lastX = e.clientX
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const held = (performance.now() - d.t) / 1000
    const movedPx = Math.abs(d.lastX - d.x)
    const dYaw = yaw.current - d.yaw
    if (held < TAP_TIME && movedPx < TAP_MOVE) {
      onTogglePlay()
    } else if (dYaw > TURN_THRESHOLD) {
      onPlay()
    } else if (dYaw < -TURN_THRESHOLD) {
      onSkip()
    }
  }

  return (
    <group
      ref={group}
      position={[0, halfHeight, 0]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <group scale={scale}>
        <primitive object={object} dispose={null} />
      </group>
    </group>
  )
}

function Scene(props: { isPlaying: boolean; onTogglePlay: () => void; onPlay: () => void; onSkip: () => void }) {
  return (
    <>
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
        <orthographicCamera attach="shadow-camera" args={[-1.6, 1.6, 1.6, -1.6, 1, 30]} />
      </directionalLight>
      <directionalLight position={[6, 5, 4]} intensity={0.8} color="#bcd2ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#e3dfd4" roughness={1} metalness={0} />
      </mesh>

      <Suspense fallback={null}>
        <Rig {...props} />
      </Suspense>
    </>
  )
}

export default function GestureScene(props: {
  isPlaying: boolean
  onTogglePlay: () => void
  onPlay: () => void
  onSkip: () => void
}) {
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
      <Scene {...props} />
      <PostFx aoRadius={0.16} aoIntensity={0.9} />
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)

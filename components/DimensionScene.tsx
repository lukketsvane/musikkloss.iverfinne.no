"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF, Line, Html } from "@react-three/drei"
import { Suspense, useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { recentre } from "@/lib/gltf"
import { PostFx } from "@/components/PostFx"

const MODEL_URL = "/microbit_cube.glb"
const SIZE = 1.5
const REST_YAW = -0.62 // a fuller 3/4 so all three edges (W/H/D) read, not front-on
const INK = "#10182a"
const GAP = 0.22 // how far the callout sits off the cube face
const OVER = 0.06 // how far the extension lines overshoot the tick

// One dimension callout: an offset measurement line with end ticks and a
// label, growing from its centre on entrance. `axis` picks which world axis
// the line runs along; the group is oriented so its local X maps onto it.
function Callout({
  length,
  label,
  position,
  axis,
  progress,
  labelSide = [0, 1, 0],
}: {
  length: number
  label: string
  position: [number, number, number]
  axis: "x" | "y" | "z"
  progress: React.MutableRefObject<number>
  labelSide?: [number, number, number]
}) {
  const root = useRef<THREE.Group>(null)
  const grow = useRef<THREE.Group>(null)
  const half = length / 2
  const rotation: [number, number, number] =
    axis === "x" ? [0, 0, 0] : axis === "y" ? [0, 0, Math.PI / 2] : [0, -Math.PI / 2, 0]
  const tick = SIZE * 0.05

  // dimension lines read as an overlay diagram — draw them on top of the cube
  // and floor regardless of depth, the way a technical callout sits over the
  // product rather than being occluded by it
  useEffect(() => {
    root.current?.traverse((o) => {
      const line = o as any
      if (line.material?.isLineMaterial || line.isLine2) {
        line.material.depthTest = false
        line.material.transparent = true
        line.renderOrder = 20
      }
    })
  }, [])

  useFrame(() => {
    const t = progress.current
    if (grow.current) grow.current.scale.x = t
  })

  return (
    <group position={position} ref={root}>
      <group rotation={rotation}>
        <group ref={grow}>
          <Line points={[[-half, 0, 0], [half, 0, 0]]} color={INK} lineWidth={1.4} />
          <Line points={[[-half, -tick, 0], [-half, tick, 0]]} color={INK} lineWidth={1.4} />
          <Line points={[[half, -tick, 0], [half, tick, 0]]} color={INK} lineWidth={1.4} />
        </group>
      </group>
      <Html
        position={[labelSide[0] * GAP * 0.9, labelSide[1] * GAP * 0.9, labelSide[2] * GAP * 0.9]}
        center
        zIndexRange={[5, 0]}
        wrapperClass="dim-label-wrap"
      >
        <span className="dim-label">{label}</span>
      </Html>
    </group>
  )
}

function Rig() {
  const gltf = useGLTF(MODEL_URL)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const progress = useRef(0)

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
      }
    })
    // half-extents of the scaled model (its bbox is axis-aligned before yaw)
    const he = dims.clone().multiplyScalar(scale / 2)
    return { object, scale, he }
  }, [gltf.scene])

  useMemo(() => {
    const aspect = size.width / size.height
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = 30
    const halfV = Math.tan((cam.fov / 2) * (Math.PI / 180))
    // frame the cube plus the callouts + labels that sit off each face
    const frame = Math.max(he.x, he.y) + GAP * 3.2
    const need = (frame * 1.08) / Math.min(1, aspect)
    const dist = need / halfV + 0.2
    // camera sits at a FIXED front azimuth (straight down -Z, slightly raised) —
    // the 3/4 comes entirely from the cube's own REST_YAW rotation. (Orbiting
    // the camera BY the same yaw the cube is turned by would cancel out, leaving
    // the pose unchanged no matter the yaw value.)
    const el = THREE.MathUtils.degToRad(19)
    cam.position.set(0, he.y * 0.9 + Math.sin(el) * dist, Math.cos(el) * dist)
    cam.up.set(0, 1, 0)
    cam.near = 0.1
    cam.far = 100
    cam.aspect = aspect
    cam.lookAt(0, he.y * 0.86, 0)
    cam.updateProjectionMatrix()
  }, [camera, size, he])

  useFrame(() => {
    progress.current += (1 - progress.current) * 0.06
  })

  // The model sits from y=0..2*he.y (group lifted by he.y). Callouts:
  //  - width  (X, 62mm): along the bottom front edge
  //  - height (Y, 60mm): up the left front edge
  //  - depth  (Z, 42mm): along the bottom right edge, running back
  return (
    <>
      <group position={[0, he.y, 0]} rotation={[0, REST_YAW, 0]}>
        <group scale={scale}>
          <primitive object={object} dispose={null} />
        </group>

        <Callout
          axis="x"
          length={he.x * 2}
          label="62 mm"
          position={[0, -he.y - GAP * 0.55, he.z + GAP]}
          labelSide={[0, -1, 0]}
          progress={progress}
        />
        <Callout
          axis="y"
          length={he.y * 2}
          label="60 mm"
          position={[-he.x - GAP, 0, he.z + OVER]}
          labelSide={[-1, 0, 0]}
          progress={progress}
        />
        <Callout
          axis="z"
          length={he.z * 2}
          label="42 mm"
          position={[he.x + GAP, -he.y - GAP * 0.55, 0]}
          labelSide={[1, -0.5, 0]}
          progress={progress}
        />
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
        <orthographicCamera attach="shadow-camera" args={[-1.6, 1.6, 1.6, -1.6, 1, 30]} />
      </directionalLight>
      <directionalLight position={[6, 5, 4]} intensity={0.8} color="#bcd2ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#e3dfd4" roughness={1} metalness={0} />
      </mesh>
    </>
  )
}

export default function DimensionScene() {
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
        <Rig />
      </Suspense>
      <PostFx aoRadius={0.16} aoIntensity={0.9} />
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)

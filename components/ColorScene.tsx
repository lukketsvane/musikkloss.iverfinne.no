"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { recentre, LED_FORWARD_MM } from "@/lib/gltf"
import { PostFx } from "@/components/PostFx"

const MODEL_URL = "/microbit_cube.glb"
const SIZE = 1.55
const REST_YAW = -0.5

export const COLORS = [
  { id: "kobolt", label: "Kobolt", hex: "#12305e" },
  { id: "kremkvit", label: "Kremkvit", hex: "#dcd3bf" },
  { id: "terrakotta", label: "Terrakotta", hex: "#9c4527" },
  { id: "grafitt", label: "Grafitt", hex: "#242424" },
] as const

// Slow idle spin, drag-to-turn like a product-shot turntable — a single
// finger/pointer is enough, no gesture vocabulary to learn.
function Turntable({ colorId }: { colorId: string }) {
  const gltf = useGLTF(MODEL_URL)
  const group = useRef<THREE.Group>(null)
  const yaw = useRef(REST_YAW)
  const drag = useRef<{ x: number; yaw: number } | null>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const { object, scale, halfHeight, shellMat, baseMat } = useMemo(() => {
    const { object, scale, size: dims } = recentre(gltf.scene, SIZE)
    let shellMat: THREE.MeshStandardMaterial | null = null
    let baseMat: THREE.MeshStandardMaterial | null = null
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (mesh.name === "shell" || mesh.name === "base") {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        mesh.material = mat
        if (mesh.name === "shell") shellMat = mat
        else baseMat = mat
      }
      if (mesh.name === "led_on") {
        mesh.castShadow = false
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
        mat.emissiveIntensity = 12
        mesh.material = mat
        mesh.position.z += LED_FORWARD_MM
      }
    })
    return { object, scale, halfHeight: (dims.y * scale) / 2, shellMat, baseMat }
  }, [gltf.scene])

  // recolour in place when the swatch changes — no remount, no material churn
  useMemo(() => {
    const target = COLORS.find((c) => c.id === colorId) ?? COLORS[0]
    const col = new THREE.Color(target.hex)
    shellMat?.color.copy(col)
    baseMat?.color.copy(col)
  }, [colorId, shellMat, baseMat])

  useMemo(() => {
    const aspect = size.width / size.height
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = 30
    const halfV = Math.tan((cam.fov / 2) * (Math.PI / 180))
    // frame the cube's full height (it stands from y=0 to y=2*halfHeight) plus
    // margin — this stage is landscape (4:3), so the vertical extent is the
    // binding constraint; too-small a frame here crops the rounded top
    const half = halfHeight * 1.5
    const need = (half * 1.12) / Math.min(1, aspect)
    const dist = need / halfV + 0.2
    const el = THREE.MathUtils.degToRad(20)
    cam.position.set(0, halfHeight + Math.sin(el) * dist, Math.cos(el) * dist)
    cam.up.set(0, 1, 0)
    cam.near = 0.1
    cam.far = 100
    cam.aspect = aspect
    cam.lookAt(0, halfHeight, 0)
    cam.updateProjectionMatrix()
  }, [camera, size, halfHeight])

  // rest at a fixed flattering angle (no random tumble) — drag to look around,
  // then spring back, rather than an unattended spin that can land edge-on
  useFrame(() => {
    if (!drag.current) yaw.current += (REST_YAW - yaw.current) * 0.1
    if (group.current) group.current.rotation.y = yaw.current
  })

  const onDown = (e: any) => {
    e.stopPropagation()
    e.target?.setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, yaw: yaw.current }
  }
  const onMove = (e: any) => {
    if (!drag.current) return
    yaw.current = drag.current.yaw + (e.clientX - drag.current.x) * 0.012
  }
  const onUp = () => {
    drag.current = null
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

function Scene({ colorId }: { colorId: string }) {
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
        <Turntable colorId={colorId} />
      </Suspense>
    </>
  )
}

export default function ColorScene({ colorId }: { colorId: string }) {
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
      <Scene colorId={colorId} />
      <PostFx aoRadius={0.16} aoIntensity={0.9} />
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)

"use client"

import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing"
import { ToneMappingMode } from "postprocessing"

// Shared realism post-processing, ported from the klossete engine: N8AO ambient
// occlusion grounds the cube, a gentle vignette adds depth, ACES tone mapping
// seats the contrast, SMAA cleans the edges.
//
// aoRadius is in WORLD units, not screen pixels — the same radius reads as a
// subtle grounding shadow in a tight macro shot (LedDetail) but, in a zoomed-out
// view, can cover most of a small recessed feature (the LED dots) and crush an
// emissive material's glow under it. Callers showing small/recessed detail at
// hero distance should pass a smaller aoRadius.
export function PostFx({ aoRadius = 0.8, aoIntensity = 1.3 }: { aoRadius?: number; aoIntensity?: number }) {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={aoRadius} intensity={aoIntensity} distanceFalloff={1} halfRes color="#1c160e" />
      <Vignette offset={0.35} darkness={0.22} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  )
}

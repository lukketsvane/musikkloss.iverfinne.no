"use client"

import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing"
import { ToneMappingMode } from "postprocessing"

// Shared realism post-processing, ported from the klossete engine: N8AO ambient
// occlusion grounds the cube, a gentle vignette adds depth, ACES tone mapping
// seats the contrast, SMAA cleans the edges.
export function PostFx() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={0.8} intensity={1.3} distanceFalloff={1} halfRes color="#1c160e" />
      <Vignette offset={0.35} darkness={0.22} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  )
}

"use client"

import dynamic from "next/dynamic"

// the R3F + Rapier scene is client-only (WebGL + physics WASM), so never SSR it
const CubeScene = dynamic(() => import("@/components/CubeScene"), { ssr: false })

export default function HeroStage() {
  return (
    <div className="stage">
      <CubeScene />
      <div className="hint">dra for å flytte · to fingrar for å vri</div>
      <a className="ar" rel="ar" href="/microbit_cube.usdz">
        vis i rommet
      </a>
    </div>
  )
}

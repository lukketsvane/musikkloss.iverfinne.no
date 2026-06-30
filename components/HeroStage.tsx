"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

// the R3F + Rapier scene is client-only (WebGL + physics WASM), so never SSR it
const CubeScene = dynamic(() => import("@/components/CubeScene"), { ssr: false })

export default function HeroStage() {
  const [tilt, setTilt] = useState(false)

  // The accelerometer needs an explicit permission grant on iOS 13+, and it
  // must come from a user gesture (this tap). Elsewhere it's available at once.
  const toggleTilt = async () => {
    if (tilt) {
      setTilt(false)
      return
    }
    const DOE = (typeof window !== "undefined" ? (window as any).DeviceOrientationEvent : null) as any
    try {
      if (DOE && typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission()
        if (res !== "granted") return
      }
    } catch {
      return
    }
    setTilt(true)
  }

  return (
    <div className="stage">
      <CubeScene tilt={tilt} />

      {/* motion-sensor (tilt) toggle */}
      <button
        type="button"
        onClick={toggleTilt}
        aria-pressed={tilt}
        aria-label="Rørslesensor"
        title="Rørslesensor"
        className={`stage-btn tiltbtn${tilt ? " on" : ""}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7.5" y="3.5" width="9" height="17" rx="2.2" transform="rotate(18 12 12)" />
          <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {/* Apple AR Quick Look: an <a rel="ar"> with a single <img> child opens the
          USDZ in AR on iOS. The icon is the badge. */}
      <a className="stage-btn arbtn" rel="ar" href="/microbit_cube.usdz" aria-label="Vis i rommet (AR)">
        <img src="/ar.svg" alt="Vis i AR" width={26} height={26} />
      </a>
    </div>
  )
}

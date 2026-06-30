"use client"

import dynamic from "next/dynamic"

// client-only (WebGL), same reasoning as HeroStage
const LedDetail = dynamic(() => import("@/components/LedDetail"), { ssr: false })

export default function DetailStage() {
  return (
    <div className="detail-stage">
      <LedDetail />
    </div>
  )
}

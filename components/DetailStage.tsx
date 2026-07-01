"use client"

import dynamic from "next/dynamic"
import { LazyStage } from "@/components/LazyStage"

// client-only (WebGL) — no server-side rendering for a Three.js scene
const LedDetail = dynamic(() => import("@/components/LedDetail"), { ssr: false })

export default function DetailStage() {
  return (
    <LazyStage className="detail-stage">
      <LedDetail />
    </LazyStage>
  )
}

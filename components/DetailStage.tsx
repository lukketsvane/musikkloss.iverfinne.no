"use client"

import dynamic from "next/dynamic"
import { LazyStage } from "@/components/LazyStage"

// client-only (WebGL), same reasoning as HeroStage
const LedDetail = dynamic(() => import("@/components/LedDetail"), { ssr: false })

export default function DetailStage() {
  return (
    <LazyStage className="detail-stage">
      <LedDetail />
    </LazyStage>
  )
}

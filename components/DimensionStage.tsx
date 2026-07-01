"use client"

import dynamic from "next/dynamic"
import { LazyStage } from "@/components/LazyStage"

const DimensionScene = dynamic(() => import("@/components/DimensionScene"), { ssr: false })

export default function DimensionStage() {
  return (
    <LazyStage className="detail-stage dim-stage">
      <DimensionScene />
    </LazyStage>
  )
}

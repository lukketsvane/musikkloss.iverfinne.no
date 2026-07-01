"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { COLORS } from "@/components/ColorScene"

const ColorScene = dynamic(() => import("@/components/ColorScene"), { ssr: false })

export default function ColorPicker() {
  const [colorId, setColorId] = useState<string>(COLORS[0].id)

  return (
    <div className="detail-col">
      <div className="detail-stage color-stage">
        <ColorScene colorId={colorId} />
      </div>
      <div className="swatches">
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`swatch${c.id === colorId ? " on" : ""}`}
            style={{ ["--swatch" as any]: c.hex }}
            onClick={() => setColorId(c.id)}
            aria-pressed={c.id === colorId}
            aria-label={c.label}
            title={c.label}
          />
        ))}
      </div>
    </div>
  )
}

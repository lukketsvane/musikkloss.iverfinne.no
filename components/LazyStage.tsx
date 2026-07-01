"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

// Mounts its children (a WebGL canvas) only once the container scrolls near
// the viewport, and unmounts again when it scrolls well out of view. The page
// has four R3F canvases; mounting them all at once spins up four WebGL
// contexts on load — expensive everywhere and liable to hit the browser's
// per-page context cap on mobile. This keeps only the visible scenes live.
export function LazyStage({
  className,
  children,
  rootMargin = "200px",
}: {
  className?: string
  children: ReactNode
  rootMargin?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  return (
    <div ref={ref} className={className}>
      {active ? children : null}
    </div>
  )
}

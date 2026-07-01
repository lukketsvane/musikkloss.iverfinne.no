"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { LazyStage } from "@/components/LazyStage"

const GestureScene = dynamic(() => import("@/components/GestureScene"), { ssr: false })

// Real Spotify, played through Spotify's own official Embed IFrame API — no
// backend, no keys: the iframe IS the real Spotify player (art, title,
// progress; full tracks if you're signed in to Spotify, 30s previews
// otherwise). Tracks are pulled straight off Aphex Twin's own Spotify artist
// page. The 3D cube's turn/flip/balance gestures drive it via the controller.
const TRACKS = [
  "spotify:track:7o2AeQZzfCERsRmOM86EcB", // Xtal
  "spotify:track:643gyipSU7dkmrFhJ8UAIm", // Pulsewidth
  "spotify:track:4LIM4qmpHABufePRrLWbiM", // Qkthr
  "spotify:track:6gbmylJ7sB7NFfMfTQHosf", // Alberto Balsalm
  "spotify:track:7glKwbR1DyuIuE6XvZvJbQ", // #3
  "spotify:track:1uaGSDFsLdReQgg8p7Obwh", // Avril 14th
  "spotify:track:5oKbtirX6EbMMOgD2fMJ6E", // 180db_ [130]
  "spotify:track:5ljMlD10En5rRGZU0cs2Np", // aisatsana [102]
  "spotify:track:7KRQoq9GeWeCm0ZAXg5XMb", // Ageispolis
  "spotify:track:3JJ4BoL9WVHk4Yye2EGJC7", // Flim
]

const API_SRC = "https://open.spotify.com/embed/iframe-api/v1"
const READY_TIMEOUT_MS = 8000

export default function GesturePlayer() {
  const embedRef = useRef<HTMLDivElement>(null)
  const controller = useRef<any>(null)
  const index = useRef(0)
  const pendingUri = useRef<string | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasStarted = useRef(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const shuffleRef = useRef(false)
  shuffleRef.current = shuffle

  const startPending = useCallback((c: any) => {
    const uri = pendingUri.current
    if (!uri) return
    hasStarted.current = true
    try {
      c.resume()
    } catch {}
    pendingUri.current = null
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current)
      pendingTimer.current = null
    }
  }, [])

  // create the Spotify embed controller once (this component is not lazily
  // unmounted, so the controller persists for the page's lifetime). If the
  // embed never signals "ready" (script blocked, network down, iframe
  // sandboxed), fall back to a direct link instead of hanging forever.
  useEffect(() => {
    let cancelled = false
    let readyTimer: ReturnType<typeof setTimeout> | null = null
    const make = (IFrameAPI: any) => {
      if (cancelled || !embedRef.current) return
      IFrameAPI.createController(
        embedRef.current,
        { uri: TRACKS[0], width: "100%", height: "80" },
        (ctrl: any) => {
          controller.current = ctrl
          ctrl.addListener("ready", () => {
            if (readyTimer) clearTimeout(readyTimer)
            setReady(true)
          })
          ctrl.addListener("playback_update", (e: any) => {
            setIsPlaying(!e.data.isPaused)
            // confirm the just-requested track actually swapped in before
            // resuming it — event-driven, not a guessed timeout, so a slow
            // network never races a stale play() against the old track
            if (pendingUri.current && e.data.playingURI === pendingUri.current) {
              startPending(ctrl)
            }
          })
        },
      )
    }
    ;(window as any).onSpotifyIframeApiReady = make
    if ((window as any).SpotifyIframeApi) {
      make((window as any).SpotifyIframeApi)
    } else if (!document.getElementById("spotify-iframe-api")) {
      const s = document.createElement("script")
      s.id = "spotify-iframe-api"
      s.src = API_SRC
      s.async = true
      s.onerror = () => setFailed(true)
      document.body.appendChild(s)
    }
    readyTimer = setTimeout(() => {
      if (!cancelled) setFailed((prev) => prev || !controller.current)
    }, READY_TIMEOUT_MS)
    return () => {
      cancelled = true
      if (readyTimer) clearTimeout(readyTimer)
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      try {
        controller.current?.destroy?.()
      } catch {}
      controller.current = null
    }
  }, [startPending])

  const load = useCallback(
    (i: number) => {
      const c = controller.current
      if (!c) return
      index.current = (i + TRACKS.length) % TRACKS.length
      const uri = TRACKS[index.current]
      pendingUri.current = uri
      c.loadEntity(uri)
      // fallback in case playback_update never reports this exact URI (some
      // builds coalesce updates) — still resolves the pending play eventually
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      pendingTimer.current = setTimeout(() => startPending(c), 1200)
    },
    [startPending],
  )

  // when balanced on its rounded edge, the cube is "shuffling" — skips pick a
  // random track instead of the next/previous one in order, same as toggling
  // shuffle on a real player
  const pickIndex = useCallback((dir: 1 | -1) => {
    if (shuffleRef.current && TRACKS.length > 1) {
      let r = index.current
      while (r === index.current) r = Math.floor(Math.random() * TRACKS.length)
      return r
    }
    return index.current + dir
  }, [])

  const onTogglePlay = useCallback(() => controller.current?.togglePlay(), [])
  const onPlay = useCallback(() => {
    const c = controller.current
    if (!c) return
    // resume() no-ops until something has actually been loaded/played once;
    // track that explicitly rather than relying on a postMessage call to
    // throw (it won't) to decide whether play() is needed instead
    if (hasStarted.current) c.resume()
    else {
      hasStarted.current = true
      c.play()
    }
  }, [])
  const onNext = useCallback(() => load(pickIndex(1)), [load, pickIndex])
  const onPrev = useCallback(() => load(pickIndex(-1)), [load, pickIndex])
  const onBalanceChange = useCallback((balanced: boolean) => setShuffle(balanced), [])

  return (
    <div className="stage gesture-stage">
      <LazyStage className="gesture-canvas-layer">
        <GestureScene
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
          onPlay={onPlay}
          onNext={onNext}
          onPrev={onPrev}
          onBalanceChange={onBalanceChange}
        />
      </LazyStage>

      {shuffle && (
        <span className="shuffle-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 17h2.8c1 0 1.9-.5 2.5-1.4l5.4-8.2c.6-.9 1.5-1.4 2.5-1.4H20" />
            <path d="M17 3l3 3-3 3M4 7h2.8c1 0 1.9.5 2.5 1.4l.7 1M17 21l3-3-3-3" />
          </svg>
          shuffle
        </span>
      )}

      <div className="spotify-card">
        <div ref={embedRef} className="spotify-embed" />
        {!ready && !failed && <div className="spotify-loading">Koplar til Spotify…</div>}
        {failed && (
          <div className="spotify-loading">
            Fekk ikkje kontakt med Spotify —{" "}
            <a href="https://open.spotify.com/artist/6kBDZFXuLrZgHnvmPu9NsG" target="_blank" rel="noopener">
              opne i Spotify
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { LazyStage } from "@/components/LazyStage"

const GestureScene = dynamic(() => import("@/components/GestureScene"), { ssr: false })

// Real Spotify — a curated set of tracks from Spotify's own "Peaceful Piano"
// editorial playlist, played through Spotify's official Embed IFrame API. No
// backend, no keys: the iframe is the real Spotify player (art, title, progress
// and, if you're signed in to Spotify, full tracks — 30-second previews
// otherwise). The 3D cube's turn/flip gestures drive it via the controller.
const TRACKS = [
  "spotify:track:1zTqMY0pncDuHkLsQp9JHr",
  "spotify:track:0YWCYAFinPOcx2CHG0bwr3",
  "spotify:track:0as3Ar1l4C2iHxQhhy7GIS",
  "spotify:track:2hegfLKqobbWtYPg0Z31vm",
  "spotify:track:53V3JhARNabT4QOob1K5yc",
  "spotify:track:5LAptbUhdbsbUUhoV3Q1Oy",
  "spotify:track:5rtLxR4M0ZGoTe6vQOjlrU",
  "spotify:track:3LkQZrx4ozjCE1RxHON6Bc",
  "spotify:track:5rwzsU8i7jowKL9O6mWWON",
  "spotify:track:0ZwtjxyinvQPJy8dZGMXwo",
  "spotify:track:4VCdqcivjBs1bfQAGB54rQ",
  "spotify:track:0qFkEaASYYsIIQoYlN9SF9",
]

const API_SRC = "https://open.spotify.com/embed/iframe-api/v1"

export default function GesturePlayer() {
  const embedRef = useRef<HTMLDivElement>(null)
  const controller = useRef<any>(null)
  const index = useRef(0)
  const pendingPlay = useRef(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  // create the Spotify embed controller once (this component is not lazily
  // unmounted, so the controller persists for the page's lifetime)
  useEffect(() => {
    let cancelled = false
    const make = (IFrameAPI: any) => {
      if (cancelled || !embedRef.current) return
      IFrameAPI.createController(
        embedRef.current,
        { uri: TRACKS[0], width: "100%", height: "152" },
        (ctrl: any) => {
          controller.current = ctrl
          ctrl.addListener("ready", () => setReady(true))
          ctrl.addListener("playback_update", (e: any) => {
            setIsPlaying(!e.data.isPaused)
            if (pendingPlay.current && !e.data.isPaused) pendingPlay.current = false
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
    return () => {
      cancelled = true
      try {
        controller.current?.destroy?.()
      } catch {}
      controller.current = null
    }
  }, [])

  const load = useCallback((i: number) => {
    const c = controller.current
    if (!c) return
    index.current = (i + TRACKS.length) % TRACKS.length
    pendingPlay.current = true
    c.loadUri(TRACKS[index.current])
    // loadUri swaps the track; give the embed a moment, then start it
    window.setTimeout(() => {
      if (pendingPlay.current) {
        try {
          c.play()
        } catch {}
      }
    }, 450)
  }, [])

  const onTogglePlay = useCallback(() => controller.current?.togglePlay(), [])
  const onPlay = useCallback(() => {
    try {
      controller.current?.resume()
    } catch {
      controller.current?.play()
    }
  }, [])
  const onNext = useCallback(() => load(index.current + 1), [load])
  const onPrev = useCallback(() => load(index.current - 1), [load])

  return (
    <div className="stage gesture-stage">
      <LazyStage className="gesture-canvas-layer">
        <GestureScene
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
          onPlay={onPlay}
          onNext={onNext}
          onPrev={onPrev}
        />
      </LazyStage>

      <div className="spotify-card">
        <div ref={embedRef} className="spotify-embed" />
        {!ready && !failed && <div className="spotify-loading">Koplar til Spotify…</div>}
        {failed && (
          <div className="spotify-loading">
            Fekk ikkje kontakt med Spotify —{" "}
            <a href="https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO" target="_blank" rel="noopener">
              opne i Spotify
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

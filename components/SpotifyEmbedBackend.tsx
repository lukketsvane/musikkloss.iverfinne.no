"use client"

import { useEffect, useRef } from "react"
import type { PlaybackBackend } from "@/lib/spotifyBackend"

const API_SRC = "https://open.spotify.com/embed/iframe-api/v1"
const READY_TIMEOUT_MS = 8000

// Anonymous fallback: Spotify's own Embed IFrame API, no login required —
// 30s previews for anyone, full tracks if the visitor happens to already be
// logged into open.spotify.com in this browser. This is what everyone gets
// until they connect (or if connecting fails / they're not Premium).
export default function SpotifyEmbedBackend({
  firstUri,
  onReady,
  onPlaybackChange,
  onFailed,
}: {
  firstUri: string
  onReady: (backend: PlaybackBackend) => void
  onPlaybackChange: (isPlaying: boolean) => void
  onFailed: () => void
}) {
  const embedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let readyTimer: ReturnType<typeof setTimeout> | null = null
    let pendingUri: string | null = null
    let pendingTimer: ReturnType<typeof setTimeout> | null = null
    let hasStarted = false
    let controller: any = null

    const startPending = () => {
      if (!pendingUri || !controller) return
      hasStarted = true
      try {
        controller.resume()
      } catch {}
      pendingUri = null
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
      }
    }

    const make = (IFrameAPI: any) => {
      if (cancelled || !embedRef.current) return
      IFrameAPI.createController(
        embedRef.current,
        { uri: firstUri, width: "100%", height: "80" },
        (ctrl: any) => {
          controller = ctrl
          ctrl.addListener("ready", () => {
            if (readyTimer) clearTimeout(readyTimer)
            const backend: PlaybackBackend = {
              loadAndPlay: (uri) => {
                pendingUri = uri
                controller.loadEntity(uri)
                if (pendingTimer) clearTimeout(pendingTimer)
                pendingTimer = setTimeout(startPending, 1200)
              },
              resume: () => {
                if (hasStarted) controller.resume()
                else {
                  hasStarted = true
                  controller.play()
                }
              },
              freshPlay: (uri) => {
                hasStarted = true
                pendingUri = null
                controller.loadEntity(uri)
              },
              togglePlay: () => controller.togglePlay(),
            }
            onReady(backend)
          })
          ctrl.addListener("playback_update", (e: any) => {
            onPlaybackChange(!e.data.isPaused)
            if (pendingUri && e.data.playingURI === pendingUri) startPending()
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
      s.onerror = () => onFailed()
      document.body.appendChild(s)
    }
    readyTimer = setTimeout(() => {
      if (!cancelled && !controller) onFailed()
    }, READY_TIMEOUT_MS)

    return () => {
      cancelled = true
      if (readyTimer) clearTimeout(readyTimer)
      if (pendingTimer) clearTimeout(pendingTimer)
      try {
        controller?.destroy?.()
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={embedRef} className="spotify-embed" />
}

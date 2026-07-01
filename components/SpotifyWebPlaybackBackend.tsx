"use client"

import { useEffect, useRef } from "react"
import type { PlaybackBackend } from "@/lib/spotifyBackend"

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js"

// Real playback for a connected, Premium account via Spotify's Web Playback
// SDK — full tracks, not previews. Requires Premium; Spotify itself reports
// that as account_error/initialization_error, which the caller should treat
// as "fall back to the anonymous embed", not a hard failure.
export default function SpotifyWebPlaybackBackend({
  accessToken,
  firstUri,
  onReady,
  onPlaybackChange,
  onPremiumError,
}: {
  accessToken: string
  firstUri: string
  onReady: (backend: PlaybackBackend) => void
  onPlaybackChange: (isPlaying: boolean) => void
  onPremiumError: () => void
}) {
  const tokenRef = useRef(accessToken)
  tokenRef.current = accessToken

  useEffect(() => {
    let cancelled = false
    let player: any = null
    let deviceId: string | null = null
    let hasStarted = false

    const webApi = (path: string, init?: RequestInit) =>
      fetch(`https://api.spotify.com/v1${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json", ...init?.headers },
      })

    const makePlayer = () => {
      if (cancelled) return
      const Spotify = (window as any).Spotify
      player = new Spotify.Player({
        name: "musikkloss",
        getOAuthToken: (cb: (t: string) => void) => cb(tokenRef.current),
        volume: 0.6,
      })
      player.addListener("account_error", onPremiumError)
      player.addListener("initialization_error", onPremiumError)
      player.addListener("authentication_error", onPremiumError)
      player.addListener("playback_error", () => {})
      player.addListener("player_state_changed", (state: any) => {
        if (!state) return
        onPlaybackChange(!state.paused)
      })
      player.addListener("ready", ({ device_id }: { device_id: string }) => {
        if (cancelled) return
        deviceId = device_id
        const backend: PlaybackBackend = {
          loadAndPlay: (uri) => {
            hasStarted = true
            webApi(`/me/player/play?device_id=${deviceId}`, {
              method: "PUT",
              body: JSON.stringify({ uris: [uri] }),
            })
          },
          resume: () => {
            if (hasStarted) player.resume()
            else {
              hasStarted = true
              webApi(`/me/player/play?device_id=${deviceId}`, {
                method: "PUT",
                body: JSON.stringify({ uris: [firstUri] }),
              })
            }
          },
          pause: () => player.pause(),
          freshPlay: (uri) => {
            hasStarted = true
            webApi(`/me/player/play?device_id=${deviceId}`, {
              method: "PUT",
              body: JSON.stringify({ uris: [uri] }),
            })
          },
          togglePlay: () => player.togglePlay(),
        }
        onReady(backend)
      })
      player.connect()
    }

    if ((window as any).Spotify) {
      makePlayer()
    } else {
      ;(window as any).onSpotifyWebPlaybackSDKReady = makePlayer
      if (!document.getElementById("spotify-web-playback-sdk")) {
        const s = document.createElement("script")
        s.id = "spotify-web-playback-sdk"
        s.src = SDK_SRC
        s.async = true
        s.onerror = onPremiumError
        document.body.appendChild(s)
      }
    }

    return () => {
      cancelled = true
      try {
        player?.disconnect()
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

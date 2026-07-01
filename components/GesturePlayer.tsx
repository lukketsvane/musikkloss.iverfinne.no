"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { LazyStage } from "@/components/LazyStage"
import { useSpotifyAuth } from "@/components/useSpotifyAuth"
import SpotifyEmbedBackend from "@/components/SpotifyEmbedBackend"
import SpotifyWebPlaybackBackend from "@/components/SpotifyWebPlaybackBackend"
import type { PlaybackBackend } from "@/lib/spotifyBackend"

const GestureScene = dynamic(() => import("@/components/GestureScene"), { ssr: false })

// Real Spotify. Connected Premium accounts get full tracks via the Web
// Playback SDK; everyone else (not connected, or connected without Premium)
// gets Spotify's own anonymous Embed IFrame API instead (art, title, 30s
// previews). Tracks are pulled straight off Aphex Twin's own Spotify artist
// page. The 3D cube's turn/flip/balance gestures drive whichever is active.
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

export default function GesturePlayer() {
  const backendRef = useRef<PlaybackBackend | null>(null)
  const index = useRef(0)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [premiumError, setPremiumError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const shuffleRef = useRef(false)
  shuffleRef.current = shuffle

  const { accessToken, connected, checked, connect, disconnect } = useSpotifyAuth()
  const useSdk = connected && !!accessToken && !premiumError

  // whichever backend is mounted swaps out from under the loading/failed
  // state whenever connect status changes — reset so the UI reflects the
  // newly-mounting backend, not the previous one's stale state
  useEffect(() => {
    setReady(false)
    setFailed(false)
    backendRef.current = null
  }, [useSdk])

  const handleReady = useCallback((backend: PlaybackBackend) => {
    backendRef.current = backend
    setReady(true)
  }, [])

  const load = useCallback((i: number) => {
    index.current = (i + TRACKS.length) % TRACKS.length
    backendRef.current?.loadAndPlay(TRACKS[index.current])
  }, [])

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

  const onTogglePlay = useCallback(() => backendRef.current?.togglePlay(), [])
  const onPlay = useCallback(() => backendRef.current?.resume(), [])
  const onPause = useCallback(() => backendRef.current?.pause(), [])
  const onNext = useCallback(() => load(pickIndex(1)), [load, pickIndex])
  const onPrev = useCallback(() => load(pickIndex(-1)), [load, pickIndex])
  const onBalanceChange = useCallback((balanced: boolean) => setShuffle(balanced), [])
  const handlePremiumError = useCallback(() => setPremiumError(true), [])
  const handleDisconnect = useCallback(() => {
    disconnect()
    setPremiumError(false)
  }, [disconnect])

  return (
    <div className="stage gesture-stage">
      <LazyStage className="gesture-canvas-layer">
        <GestureScene
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
          onPlay={onPlay}
          onPause={onPause}
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
        <div className="spotify-connect-row">
          <span className="spotify-connect-label">
            {useSdk ? "Tilkopla · fulle låtar" : connected ? "Tilkopla · utdrag" : "Ikkje tilkopla · utdrag"}
          </span>
          {checked && (
            connected ? (
              <button type="button" className="spotify-connect-btn" onClick={handleDisconnect}>
                Kopla frå
              </button>
            ) : (
              <button type="button" className="spotify-connect-btn" onClick={connect}>
                Kopla til Spotify
              </button>
            )
          )}
        </div>

        {useSdk ? (
          <SpotifyWebPlaybackBackend
            key="sdk"
            accessToken={accessToken as string}
            firstUri={TRACKS[0]}
            onReady={handleReady}
            onPlaybackChange={setIsPlaying}
            onPremiumError={handlePremiumError}
          />
        ) : (
          <SpotifyEmbedBackend
            key="embed"
            firstUri={TRACKS[0]}
            onReady={handleReady}
            onPlaybackChange={setIsPlaying}
            onFailed={() => setFailed(true)}
          />
        )}

        {!ready && !failed && <div className="spotify-loading">Koplar til Spotify…</div>}
        {failed && (
          <div className="spotify-loading">
            Fekk ikkje kontakt med Spotify —{" "}
            <a href="https://open.spotify.com/artist/6kBDZFXuLrZgHnvmPu9NsG" target="_blank" rel="noopener">
              opne i Spotify
            </a>
          </div>
        )}
        {premiumError && (
          <div className="spotify-loading">Kontoen speler ikkje fulle låtar her (krev Premium) — nyttar utdrag i staden.</div>
        )}
      </div>
    </div>
  )
}

"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useAmbientSynth } from "@/components/useAmbientSynth"
import { LazyStage } from "@/components/LazyStage"

const GestureScene = dynamic(() => import("@/components/GestureScene"), { ssr: false })

// Fictional, unlicensed tracks — this simulates the gesture vocabulary the
// real product uses to control playback, not a live Spotify integration.
const TRACKS = [
  { title: "Kveldsro", artist: "Fjordlys", duration: 184 },
  { title: "Tidevatn", artist: "Nordglid", duration: 201 },
  { title: "Morgonlys", artist: "Steinvik", duration: 176 },
]

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

export default function GesturePlayer() {
  const [trackIndex, setTrackIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const track = TRACKS[trackIndex]

  useAmbientSynth(trackIndex, isPlaying, soundOn)

  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= track.duration) {
          setTrackIndex((i) => (i + 1) % TRACKS.length)
          return 0
        }
        return e + 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [isPlaying, track.duration])

  const skip = () => {
    setTrackIndex((i) => (i + 1) % TRACKS.length)
    setElapsed(0)
    setIsPlaying(true)
  }
  const play = () => setIsPlaying(true)
  const togglePlay = () => setIsPlaying((p) => !p)

  return (
    <div className="stage gesture-stage">
      <LazyStage className="gesture-canvas-layer">
        <GestureScene isPlaying={isPlaying} onTogglePlay={togglePlay} onPlay={play} onSkip={skip} />
      </LazyStage>

      <div className="player-ui">
        <div className="player-track">
          <b>{track.title}</b>
          <span>{track.artist}</span>
        </div>
        <div className="player-bar">
          <div className="player-bar-fill" style={{ width: `${(elapsed / track.duration) * 100}%` }} />
        </div>
        <div className="player-row">
          <span className="player-time">{fmt(elapsed)}</span>
          <button type="button" className="player-play" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Spel"}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13l11-6.5-11-6.5Z" /></svg>
            )}
          </button>
          <span className="player-time">{fmt(track.duration)}</span>
        </div>
      </div>

      <button
        type="button"
        className={`stage-btn soundbtn${soundOn ? " on" : ""}`}
        onClick={() => setSoundOn((s) => !s)}
        aria-pressed={soundOn}
        aria-label="Lyd"
        title="Lyd"
      >
        {soundOn ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9v6h4l5 4V5L8 9H4Z" />
            <path d="M17 8.5a5 5 0 0 1 0 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9v6h4l5 4V5L8 9H4Z" />
            <path d="M16 9.5 20.5 14M20.5 9.5 16 14" />
          </svg>
        )}
      </button>

    </div>
  )
}

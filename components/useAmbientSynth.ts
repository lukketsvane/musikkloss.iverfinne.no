"use client"

import { useEffect, useRef } from "react"

// Fictional, unlicensed ambient pieces synthesised live in the browser — a
// demo of the gesture vocabulary, not a real Spotify integration. Each track
// is a slow chord progression (a warm sine pad holding the chord) with a
// gentle arpeggio walking the chord tones on top, so it reads as an actual
// evolving piece of music rather than a held drone.

// note frequencies (Hz), equal temperament
const N = {
  G2: 98.0, A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0,
  A3: 220.0, Bb3: 233.08, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63,
  F4: 349.23, G4: 392.0, A4: 440.0,
}

// each track: an array of chords, each chord a set of frequencies (root/third/
// fifth voicing). One chord per bar; the pad holds it, the arp walks it.
const TRACKS: number[][][] = [
  // Kveldsro — A minor: Am · F · C · G
  [[N.A2, N.C4, N.E4], [N.F3, N.A3, N.C4], [N.C3, N.E3, N.G3], [N.G2, N.B3, N.D4]],
  // Tidevatn — D minor: Dm · Bb · F · C
  [[N.D3, N.F4, N.A4], [N.Bb3, N.D4, N.F4], [N.F3, N.A3, N.C4], [N.C3, N.E3, N.G3]],
  // Morgonlys — G major: G · Em · C · D
  [[N.G2, N.B3, N.D4], [N.E3, N.G3, N.B3], [N.C3, N.E3, N.G3], [N.D3, N.F4, N.A4]],
]

const BAR_MS = 3200 // one chord per bar
const ARP_MS = 400 // arpeggio step
const PAD_LEVEL = 0.05
const ARP_LEVEL = 0.06

type Graph = {
  pad: OscillatorNode[]
  padGain: GainNode
  arp: OscillatorNode
  arpGain: GainNode
  master: GainNode
}

export function useAmbientSynth(trackIndex: number, isPlaying: boolean, soundOn: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  const graphRef = useRef<Graph | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepRef = useRef(0)
  const trackRef = useRef(trackIndex)
  trackRef.current = trackIndex

  const build = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      ctxRef.current = new AC()
    }
    const ctx = ctxRef.current
    if (ctx.state === "suspended") ctx.resume()
    if (!graphRef.current) {
      const filter = ctx.createBiquadFilter()
      filter.type = "lowpass"
      filter.frequency.value = 1300
      filter.Q.value = 0.6

      const master = ctx.createGain()
      master.gain.value = 0
      filter.connect(master)
      master.connect(ctx.destination)

      const padGain = ctx.createGain()
      padGain.gain.value = PAD_LEVEL
      padGain.connect(filter)
      const pad = [0, 0, 0].map((_, i) => {
        const o = ctx.createOscillator()
        o.type = "sine"
        o.frequency.value = 220
        if (i === 2) o.detune.value = 4 // a touch of chorus warmth
        o.connect(padGain)
        o.start()
        return o
      })

      const arpGain = ctx.createGain()
      arpGain.gain.value = 0
      arpGain.connect(filter)
      const arp = ctx.createOscillator()
      arp.type = "triangle"
      arp.frequency.value = 440
      arp.connect(arpGain)
      arp.start()

      graphRef.current = { pad, padGain, arp, arpGain, master }
    }
    return { ctx, graph: graphRef.current }
  }

  useEffect(() => {
    if (!isPlaying || !soundOn) {
      const ctx = ctxRef.current
      const g = graphRef.current
      if (ctx && g) g.master.gain.setTargetAtTime(0, ctx.currentTime, 0.5)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    const { ctx, graph } = build()
    graph.master.gain.setTargetAtTime(1, ctx.currentTime, 0.8)

    const tick = () => {
      const prog = TRACKS[trackRef.current % TRACKS.length]
      const stepsPerBar = Math.round(BAR_MS / ARP_MS)
      const bar = Math.floor(stepRef.current / stepsPerBar) % prog.length
      const chord = prog[bar]
      const now = ctx.currentTime

      // glide the pad to the current chord at the top of each bar
      if (stepRef.current % stepsPerBar === 0) {
        graph.pad.forEach((o, i) => o.frequency.setTargetAtTime(chord[i % chord.length], now, 0.25))
      }

      // arpeggio: step through chord tones (root, third, fifth, third...) with
      // a soft plucked envelope so a melody line moves over the held pad
      const arpSeq = [chord[0], chord[1], chord[2], chord[1]]
      const note = arpSeq[stepRef.current % arpSeq.length]
      graph.arp.frequency.setTargetAtTime(note * 2, now, 0.02)
      graph.arpGain.gain.cancelScheduledValues(now)
      graph.arpGain.gain.setValueAtTime(graph.arpGain.gain.value, now)
      graph.arpGain.gain.linearRampToValueAtTime(ARP_LEVEL, now + 0.03)
      graph.arpGain.gain.exponentialRampToValueAtTime(0.0001, now + ARP_MS / 1000)

      stepRef.current += 1
    }

    tick()
    timerRef.current = setInterval(tick, ARP_MS)
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, soundOn, trackIndex])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      const g = graphRef.current
      g?.pad.forEach((o) => o.stop())
      g?.arp.stop()
      ctxRef.current?.close()
    }
  }, [])
}

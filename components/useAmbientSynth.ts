"use client"

import { useEffect, useRef } from "react"

// Fictional, unlicensed ambient pads — a demo of the gesture vocabulary, not
// a real Spotify integration. Root frequency per track, a soft fifth above.
const TRACK_ROOT = [220, 246.94, 196]

type Nodes = { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode }

export function useAmbientSynth(trackIndex: number, isPlaying: boolean, soundOn: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  const nodesRef = useRef<Nodes | null>(null)

  const ensureNodes = () => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      ctxRef.current = new AC()
    }
    const ctx = ctxRef.current
    if (ctx.state === "suspended") ctx.resume()
    if (!nodesRef.current) {
      const osc = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const filter = ctx.createBiquadFilter()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc2.type = "sine"
      filter.type = "lowpass"
      filter.frequency.value = 1100
      gain.gain.value = 0
      osc.connect(filter)
      osc2.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc2.start()
      nodesRef.current = { osc, osc2, gain }
    }
    return { ctx, nodes: nodesRef.current }
  }

  useEffect(() => {
    if (!isPlaying || !soundOn) {
      const ctx = ctxRef.current
      const nodes = nodesRef.current
      if (ctx && nodes) nodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
      return
    }
    const { ctx, nodes } = ensureNodes()
    const now = ctx.currentTime
    const root = TRACK_ROOT[trackIndex % TRACK_ROOT.length]
    nodes.osc.frequency.setTargetAtTime(root, now, 0.35)
    nodes.osc2.frequency.setTargetAtTime(root * 1.5, now, 0.35)
    nodes.gain.gain.setTargetAtTime(0.05, now, 0.7)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, soundOn, trackIndex])

  useEffect(() => {
    return () => {
      nodesRef.current?.osc.stop()
      nodesRef.current?.osc2.stop()
      ctxRef.current?.close()
    }
  }, [])
}

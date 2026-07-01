"use client"

import { useCallback, useEffect, useState } from "react"
import { beginConnect, disconnect as disconnectStored, getValidAccessToken, isConnected } from "@/lib/spotifyAuth"

// Tracks the connect/disconnect state and hands out a currently-valid access
// token, refreshing it in the background before it expires so a long-open
// tab doesn't silently drop mid-listen.
export function useSpotifyAuth() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  const refresh = useCallback(async () => {
    const token = await getValidAccessToken()
    setAccessToken(token)
    return token
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isConnected()) {
        setChecked(true)
        return
      }
      const token = await refresh()
      if (!cancelled) setChecked(true)
      return token
    })()
    // re-check periodically while the tab stays open so the token never
    // goes stale mid-session
    const interval = setInterval(refresh, 4 * 60 * 1000)
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  const connect = useCallback(() => {
    beginConnect()
  }, [])

  const disconnect = useCallback(() => {
    disconnectStored()
    setAccessToken(null)
  }, [])

  return { accessToken, connected: !!accessToken, checked, connect, disconnect }
}

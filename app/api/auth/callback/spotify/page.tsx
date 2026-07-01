"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { completeConnect } from "@/lib/spotifyAuth"

function Callback() {
  const router = useRouter()
  const params = useSearchParams()
  const [message, setMessage] = useState("Koplar til Spotify…")

  useEffect(() => {
    const error = params.get("error")
    const code = params.get("code")
    if (error) {
      setMessage(`Spotify avviste tilkoplinga (${error}). Send tilbake…`)
      const t = setTimeout(() => router.replace("/"), 1800)
      return () => clearTimeout(t)
    }
    if (!code) {
      router.replace("/")
      return
    }
    let cancelled = false
    completeConnect(code).then((ok) => {
      if (cancelled) return
      setMessage(ok ? "Tilkopla! Send tilbake…" : "Fekk ikkje kopla til. Send tilbake…")
      setTimeout(() => router.replace("/"), 600)
    })
    return () => {
      cancelled = true
    }
  }, [params, router])

  return (
    <div className="callback-screen">
      <p>{message}</p>
    </div>
  )
}

export default function SpotifyCallbackPage() {
  return (
    <Suspense fallback={<div className="callback-screen"><p>Koplar til Spotify…</p></div>}>
      <Callback />
    </Suspense>
  )
}

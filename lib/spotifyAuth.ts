"use client"

// Spotify "Connect with Spotify" — Authorization Code + PKCE, entirely
// client-side, no backend and no client secret. Spotify's Client ID is a
// public identifier (it's sent in the browser's address bar during the
// authorize redirect), safe to ship in client code.
const CLIENT_ID = "8f06abc8c27c45ab9628f47abb912eb0"
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ")

const VERIFIER_KEY = "spotify_pkce_verifier"
const TOKENS_KEY = "spotify_tokens"
const REFRESH_SKEW_MS = 60_000 // refresh a minute before actual expiry

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number }

// must match the Redirect URI registered on the Spotify app exactly —
// registered as https://musikkloss.iverfinne.no/api/auth/callback/spotify
function redirectUri() {
  return `${window.location.origin}/api/auth/callback/spotify`
}

function base64url(bytes: Uint8Array) {
  let str = ""
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function sha256(input: string) {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return new Uint8Array(digest)
}

function randomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(64))
  return base64url(bytes)
}

function readTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeTokens(t: Tokens) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(t))
}

// Kick off the login redirect — the user comes back to /spotify-callback,
// which exchanges the returned code for tokens and sends them home.
export async function beginConnect() {
  const verifier = randomVerifier()
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  const challenge = base64url(await sha256(verifier))
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function completeConnect(code: string): Promise<boolean> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) return false
  sessionStorage.removeItem(VERIFIER_KEY)
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: CLIENT_ID,
    code_verifier: verifier,
  })
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) return false
  const json = await res.json()
  writeTokens({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  })
  return true
}

async function refresh(refreshToken: string): Promise<Tokens | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  })
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) return null
  const json = await res.json()
  const next: Tokens = {
    accessToken: json.access_token,
    // Spotify doesn't always return a new refresh_token — keep the old one if so
    refreshToken: json.refresh_token || refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  writeTokens(next)
  return next
}

// Returns a currently-valid access token, refreshing first if it's near
// expiry, or null if there's no connected session at all.
export async function getValidAccessToken(): Promise<string | null> {
  const t = readTokens()
  if (!t) return null
  if (Date.now() < t.expiresAt - REFRESH_SKEW_MS) return t.accessToken
  const refreshed = await refresh(t.refreshToken)
  return refreshed?.accessToken ?? null
}

export function isConnected() {
  return readTokens() != null
}

export function disconnect() {
  localStorage.removeItem(TOKENS_KEY)
}

// Both playback backends (the anonymous IFrame embed, and the real Web
// Playback SDK for connected Premium accounts) expose this same shape, so
// GesturePlayer's gesture-driven controls don't need to know or care which
// one is currently mounted.
export type PlaybackBackend = {
  loadAndPlay: (uri: string) => void
  resume: () => void
  pause: () => void
  freshPlay: (uri: string) => void
  togglePlay: () => void
}

// Camera + tray layout. Adapted from the klossete engine: the playable area is
// an axis-aligned rectangle centred on the origin; we derive its half-extents
// from the camera framing so the box, the camera and the containment walls
// never drift apart.

export const CAM_FOV = 32

// Half-width of world we keep visible. Smaller = tighter frame = cube reads
// bigger. Phones get a tighter frame so the cube isn't tiny.
export function viewTarget(w: number, h: number) {
  const min = Math.min(w, h)
  if (min < 520) return 2.2 // phones
  if (min < 820) return 2.7 // small tablets
  return 3.0
}

const BOX_INSET = 0.92
const WALL_HALF_THICK = 0.4
export const WALL_COL_HEIGHT = 16 // invisible containment walls — a deep box nothing escapes
export const FLOOR = 120

export type Box = { bx: number; bz: number }

// Half-extents of the playable rectangle, plus the camera distance that frames
// it for a top-down look. We use the same numbers for an angled hero camera.
export function boxLayout(aspect: number, target: number) {
  const halfV = Math.tan((CAM_FOV / 2) * (Math.PI / 180))
  const dist = Math.max(target / (halfV * aspect), target / halfV) + 0.5
  const halfX = dist * halfV * aspect
  const halfZ = dist * halfV
  return { dist, bx: halfX * BOX_INSET, bz: halfZ * BOX_INSET }
}

export type Wall = { half: [number, number, number]; pos: [number, number, number] }

// Four axis-aligned walls whose inner faces sit exactly on ±bx / ±bz.
export function buildWalls({ bx, bz }: Box, height: number): Wall[] {
  const t = WALL_HALF_THICK
  const h = height / 2
  return [
    { half: [t, h, bz + 2 * t], pos: [-(bx + t), h, 0] },
    { half: [t, h, bz + 2 * t], pos: [bx + t, h, 0] },
    { half: [bx + 2 * t, h, t], pos: [0, h, -(bz + t)] },
    { half: [bx + 2 * t, h, t], pos: [0, h, bz + t] },
  ]
}

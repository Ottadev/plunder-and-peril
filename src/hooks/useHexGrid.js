const HEX_RADIUS = 40;

// 6 directions for pointy-top axial hex coordinates
const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: -1, r: 0 },
  { q: 0, r: 1 }, { q: 0, r: -1 },
  { q: 1, r: -1 }, { q: -1, r: 1 },
];

/**
 * Convert axial coordinates (q, r) to pixel position (x, y) on canvas.
 * Pointy-top orientation — standard formula for perfect hex tiling.
 */
export function hexToPixel(q, r) {
  const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
  const y = HEX_RADIUS * (3 / 2 * r);
  return { x, y };
}

/**
 * Convert pixel position (x, y) to fractional axial coordinates.
 * Inverse of hexToPixel.
 */
export function pixelToHex(x, y) {
  const q = (x / (Math.sqrt(3) * HEX_RADIUS)) - (y / (3 * HEX_RADIUS));
  const r = (2 / 3 * y) / HEX_RADIUS;
  return { q, r };
}

/**
 * Round fractional axial coordinates (q, r) to the nearest hex tile.
 * Uses cube coordinate rounding.
 */
export function hexRound(qFrac, rFrac) {
  const sFrac = -qFrac - rFrac;

  let q = Math.round(qFrac);
  let r = Math.round(rFrac);
  let s = Math.round(sFrac);

  const qDiff = Math.abs(q - qFrac);
  const rDiff = Math.abs(r - rFrac);
  const sDiff = Math.abs(s - sFrac);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  }
  // else s is the one we fixed, no change needed

  return { q, r };
}

/**
 * Compute the i-th corner vertex of a hexagon centered at (cx, cy).
 * Returns { x, y } in canvas pixel coordinates.
 * @param {number} cx - center x
 * @param {number} cy - center y
 * @param {number} size - hex radius
 * @param {number} i - corner index (0-5)
 */
export function hexCorner(cx, cy, size, i) {
  const angleDeg = 60 * i - 30;
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: cx + size * Math.cos(angleRad),
    y: cy + size * Math.sin(angleRad),
  };
}

/**
 * Generate a deterministic "random" terrain type for a given tile.
 * Returns 'ocean', 'jungle', or 'land'.
 */
export function getTileTerrain(q, r) {
  // Simple hash of coordinates for deterministic pseudo-random terrain
  const hash = (q * 374761393 + r * 668265263) & 0x7fffffff;
  const val = (hash % 1000) / 1000;

  if (val < 0.55) return 'ocean';   // 55% — oceano come tile principale
  if (val < 0.75) return 'jungle';   // 20% — isole giungla
  return 'land';                     // 25% — isole terra
}

/**
 * Get the fill color for a given terrain type.
 */
export function getTerrainColor(terrain) {
  switch (terrain) {
    case 'ocean':
      return '#1a3a5c'; // deep ocean blue
    case 'jungle':
      return '#2d5a2e'; // forest green
    case 'land':
    default:
      return '#8a7a5a'; // sandy/earthy brown — visible against background
  }
}

/**
 * Get the 6 neighboring axial coordinates for a hex tile.
 */
export function getHexNeighbors(q, r) {
  return HEX_DIRECTIONS.map(d => ({ q: q + d.q, r: r + d.r }));
}

/**
 * Check if axial coordinates are within grid bounds.
 */
export function isWithinBounds(q, r, width = 10, height = 10) {
  return q >= 0 && q < width && r >= 0 && r < height;
}

/**
 * Check if a land tile is adjacent to at least one ocean tile (coastal).
 */
export function isCoastalTile(q, r, width = 10, height = 10) {
  if (getTileTerrain(q, r) !== 'land') return false;
  const neighbors = getHexNeighbors(q, r);
  return neighbors.some(n =>
    isWithinBounds(n.q, n.r, width, height) &&
    getTileTerrain(n.q, n.r) === 'ocean'
  );
}

/**
 * Check if a tile is navigable by naval units.
 * Naval units can sail on ocean tiles and coastal land tiles.
 */
export function isNavigableTile(q, r, width = 10, height = 10) {
  if (!isWithinBounds(q, r, width, height)) return false;
  const terrain = getTileTerrain(q, r);
  if (terrain === 'ocean') return true;
  if (terrain === 'land') return isCoastalTile(q, r, width, height);
  return false;
}

/**
 * Get the movement cost for traversing a terrain type.
 */
export function getMovementCost(terrain) {
  switch (terrain) {
    case 'ocean': return 1;
    case 'jungle': return 2;
    case 'land': return 1;
    default: return 1;
  }
}

export { HEX_RADIUS };

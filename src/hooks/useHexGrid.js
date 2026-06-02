const HEX_RADIUS = 40;

// 6 directions for pointy-top axial hex coordinates
const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: -1, r: 0 },
  { q: 0, r: 1 }, { q: 0, r: -1 },
  { q: 1, r: -1 }, { q: -1, r: 1 },
];

// ── Terrain types ──────────────────────────────────────────────────────

export const TERRAIN = {
  DEEP_OCEAN: 'deep_ocean', // dark water, not navigable (map border feel)
  OCEAN: 'ocean',           // standard navigable water
  SHALLOW: 'shallow',       // coastal waters, navigable
  REEF: 'reef',             // obstacle — not navigable
  SAND: 'sand',             // beach — navigable (ships can dock)
  LAND: 'land',             // interior island — not navigable
  JUNGLE: 'jungle',         // forest interior — not navigable
  PORT: 'port',             // neutral port — navigable, heals ships
};

/** Navigable terrain types (ships can traverse) */
const NAVIGABLE = new Set([
  TERRAIN.OCEAN,
  TERRAIN.SHALLOW,
  TERRAIN.SAND,
  TERRAIN.PORT,
]);

// ── Seeded PRNG (mulberry32) for deterministic maps ────────────────────

function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Island generator ───────────────────────────────────────────────────

/**
 * Generate an organic island map using cellular automata.
 *
 * Process:
 *  1. Place 3-5 island seeds (clusters of land) using a seeded RNG.
 *  2. Grow islands with cellular automata (3 iterations).
 *  3. Classify terrain: beaches → interior → reefs → deep ocean → ports.
 *
 * @param {number} [seed=42]
 * @param {number} [width=10]
 * @param {number} [height=10]
 * @param {object} [opts]
 * @param {number} [opts.islandCount] — number of island seeds (default 3-5)
 * @returns {string[][]} 2D grid of terrain types [row][col]
 */
export function generateMap(seed = 42, width = 10, height = 10, opts = {}) {
  const rng = mulberry32(seed);

  // Step 1: initialise with ocean
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => TERRAIN.OCEAN),
  );

  // Step 2: place island seeds
  const islandCount = opts.islandCount ?? (3 + Math.floor(rng() * 3)); // 3-5
  for (let i = 0; i < islandCount; i++) {
    // Prefer central area (avoid edges for seed placement)
    const cq = 2 + Math.floor(rng() * (width - 4));
    const cr = 2 + Math.floor(rng() * (height - 4));
    const radius = 2 + Math.floor(rng() * 2); // 2-3 tile radius

    // Place a rough circular cluster
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const dist = Math.sqrt(dq * dq + dr * dr + dq * dr);
        if (dist <= radius) {
          const nq = cq + dq;
          const nr = cr + dr;
          if (isWithinBounds(nq, nr, width, height)) {
            grid[nr][nq] = TERRAIN.LAND;
          }
        }
      }
    }
  }

  // Step 3: cellular automata smoothing (3 iterations)
  for (let iter = 0; iter < 3; iter++) {
    const next = grid.map(row => [...row]);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const isLand = grid[r][c] === TERRAIN.LAND;
        const neighbors = countLandNeighbors(grid, c, r, width, height);

        if (isLand && neighbors <= 1) {
          next[r][c] = TERRAIN.OCEAN; // erode isolated land
        } else if (!isLand && neighbors >= 5) {
          next[r][c] = TERRAIN.LAND; // fill ocean pockets
        }
        // else keep unchanged
      }
    }
    // Copy back
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        grid[r][c] = next[r][c];
      }
    }
  }

  // Step 4: classify terrain
  const classified = grid.map((row, r) =>
    row.map((tile, c) => {
      if (tile !== TERRAIN.OCEAN) {
        // ── LAND tile ──
        const coastal = isAdjacentTo(grid, c, r, width, height, TERRAIN.OCEAN);

        if (coastal) {
          // Coastal land: decide between SAND, PORT, or base land
          // Ports ~15% of coastal tiles, only on non-jungle
          const elevation = rng();
          if (elevation < 0.15 && !isOnEdge(c, r, width, height)) {
            return TERRAIN.PORT; // neutral port
          }
          if (elevation < 0.4) {
            return TERRAIN.SAND; // beach
          }
          // remaining coastal land stays as base LAND or JUNGLE
          return rng() < 0.5 ? TERRAIN.LAND : TERRAIN.JUNGLE;
        } else {
          // Interior: mix of LAND and JUNGLE
          return rng() < 0.55 ? TERRAIN.JUNGLE : TERRAIN.LAND;
        }
      } else {
        // ── OCEAN tile ──
        const distToLand = distanceToNearest(grid, c, r, width, height, (v) =>
          v !== TERRAIN.OCEAN,
        );

        if (distToLand === 0) {
          // Directly adjacent to land → SHALLOW or REEF
          return rng() < 0.2 ? TERRAIN.REEF : TERRAIN.SHALLOW;
        }
        if (distToLand <= 2) {
          return TERRAIN.OCEAN; // normal ocean
        }
        return TERRAIN.DEEP_OCEAN; // far from land
      }
    }),
  );

  return classified;
}

// ── Cellular automata helpers ──────────────────────────────────────────

function countLandNeighbors(grid, c, r, width, height) {
  let count = 0;
  for (const d of HEX_DIRECTIONS) {
    const nq = c + d.q;
    const nr = r + d.r;
    if (isWithinBounds(nq, nr, width, height) && grid[nr][nq] === TERRAIN.LAND) {
      count++;
    }
  }
  return count;
}

function isAdjacentTo(grid, c, r, width, height, terrainType) {
  for (const d of HEX_DIRECTIONS) {
    const nq = c + d.q;
    const nr = r + d.r;
    if (isWithinBounds(nq, nr, width, height) && grid[nr][nq] === terrainType) {
      return true;
    }
  }
  return false;
}

function isOnEdge(c, r, width, height) {
  return c === 0 || c === width - 1 || r === 0 || r === height - 1;
}

/**
 * BFS distance to the nearest tile matching a predicate.
 */
function distanceToNearest(grid, c, r, width, height, predicate) {
  const visited = new Set();
  const key = (x, y) => `${x},${y}`;
  const queue = [{ c, r, dist: 0 }];
  visited.add(key(c, r));

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.dist > 0 && predicate(grid[cur.r][cur.c])) {
      return cur.dist;
    }
    for (const d of HEX_DIRECTIONS) {
      const nc = cur.c + d.q;
      const nr = cur.r + d.r;
      const k = key(nc, nr);
      if (isWithinBounds(nc, nr, width, height) && !visited.has(k)) {
        visited.add(k);
        queue.push({ c: nc, r: nr, dist: cur.dist + 1 });
      }
    }
  }
  return Infinity;
}

// ── Public API ─────────────────────────────────────────────────────────

/** Current map grid — set by generateMap */
let mapCache = null;
let mapSeed = null;
let mapWidth = 10;
let mapHeight = 10;

export function setMap(seed = 42, width = 10, height = 10) {
  mapCache = generateMap(seed, width, height);
  mapSeed = seed;
  mapWidth = width;
  mapHeight = height;
  return mapCache;
}

/**
 * Get the terrain for a tile. Uses the cached generated map.
 */
export function getTileTerrain(q, r) {
  if (!mapCache) setMap(42, 10, 10);
  if (r < 0 || r >= mapHeight || q < 0 || q >= mapWidth) return TERRAIN.DEEP_OCEAN;
  return mapCache[r][q];
}

/**
 * Re-generate the map with a new seed.
 */
export function regenerateMap(newSeed) {
  return setMap(newSeed, mapWidth, mapHeight);
}

/**
 * Get the current map seed.
 */
export function getMapSeed() {
  return mapSeed;
}

// ── Coordinate helpers ─────────────────────────────────────────────────

export function hexToPixel(q, r) {
  const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
  const y = HEX_RADIUS * (3 / 2 * r);
  return { x, y };
}

export function pixelToHex(x, y) {
  const q = (x / (Math.sqrt(3) * HEX_RADIUS)) - (y / (3 * HEX_RADIUS));
  const r = (2 / 3 * y) / HEX_RADIUS;
  return { q, r };
}

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

  return { q, r };
}

export function hexCorner(cx, cy, size, i) {
  const angleDeg = 60 * i - 30;
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: cx + size * Math.cos(angleRad),
    y: cy + size * Math.sin(angleRad),
  };
}

export function getHexNeighbors(q, r) {
  return HEX_DIRECTIONS.map(d => ({ q: q + d.q, r: r + d.r }));
}

export function isWithinBounds(q, r, width = 10, height = 10) {
  return q >= 0 && q < width && r >= 0 && r < height;
}

// ── Terrain queries ────────────────────────────────────────────────────

/**
 * Check if a tile is navigable by ships.
 * Ships can traverse ocean, shallow, sand (beach), and port tiles.
 */
export function isNavigableTile(q, r, width = 10, height = 10) {
  if (!isWithinBounds(q, r, width, height)) return false;
  const terrain = getTileTerrain(q, r);
  return NAVIGABLE.has(terrain);
}

/**
 * Check if a tile is coastal (adjacent to ocean/shallow water).
 * Used for treasure placement, port adjacency, etc.
 */
export function isCoastalTile(q, r, width = 10, height = 10) {
  if (!isWithinBounds(q, r, width, height)) return false;
  const terrain = getTileTerrain(q, r);
  // Only land-type tiles can be "coastal"
  if (terrain === TERRAIN.OCEAN || terrain === TERRAIN.SHALLOW ||
      terrain === TERRAIN.DEEP_OCEAN || terrain === TERRAIN.REEF) {
    return false;
  }
  const neighbors = getHexNeighbors(q, r);
  return neighbors.some(n =>
    isWithinBounds(n.q, n.r, width, height) &&
    (getTileTerrain(n.q, n.r) === TERRAIN.OCEAN ||
     getTileTerrain(n.q, n.r) === TERRAIN.SHALLOW),
  );
}

// ── Terrain rendering ──────────────────────────────────────────────────

/**
 * Get the fill color for a terrain type.
 */
export function getTerrainColor(terrain) {
  switch (terrain) {
    case TERRAIN.DEEP_OCEAN:
      return '#0f2440'; // very dark blue
    case TERRAIN.OCEAN:
      return '#1a4972'; // medium ocean blue
    case TERRAIN.SHALLOW:
      return '#2a7a9c'; // lighter coastal blue
    case TERRAIN.REEF:
      return '#c4a35a'; // sandy/reef yellow-brown
    case TERRAIN.SAND:
      return '#d4c098'; // beige sand
    case TERRAIN.LAND:
      return '#7a6a4a'; // earthy brown
    case TERRAIN.JUNGLE:
      return '#2d5a2e'; // forest green
    case TERRAIN.PORT:
      return '#6a5a3a'; // darker brown (gold structures shown on top)
    default:
      return '#1a3a5c';
  }
}

/**
 * Get a pattern/label character for a terrain type (drawn on hex).
 */
export function getTerrainSymbol(terrain) {
  switch (terrain) {
    case TERRAIN.PORT: return '⚓';
    case TERRAIN.REEF: return '~';
    case TERRAIN.SAND: return '·';
    default: return '';
  }
}

/**
 * Get movement cost for traversing a terrain type.
 */
export function getMovementCost(terrain) {
  switch (terrain) {
    case TERRAIN.OCEAN:
    case TERRAIN.SHALLOW:
    case TERRAIN.SAND:
    case TERRAIN.PORT:
      return 1;
    default:
      return Infinity; // impassable
  }
}

// ── BFS pathfinding ────────────────────────────────────────────────────

/**
 * BFS pathfinding: find the shortest path from (startQ, startR) to (targetQ, targetR).
 * Returns an array of {q, r} hexes from start to target (inclusive), or null if unreachable.
 */
export function bfsPathTo(startQ, startR, targetQ, targetR, maxCost, occupied, gridW = 10, gridH = 10) {
  const key = (q, r) => `${q},${r}`;
  const startKey = key(startQ, startR);
  const targetKey = key(targetQ, targetR);

  if (startKey === targetKey) return [{ q: startQ, r: startR }];

  const visited = new Map();
  visited.set(startKey, { parent: null, q: startQ, r: startR, cost: 0 });
  const queue = [{ q: startQ, r: startR }];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = key(current.q, current.r);
    const currentEntry = visited.get(currentKey);

    const neighbors = getHexNeighbors(current.q, current.r);
    for (const n of neighbors) {
      const nKey = key(n.q, n.r);
      if (visited.has(nKey)) continue;
      if (!isWithinBounds(n.q, n.r, gridW, gridH)) continue;
      if (occupied.has(nKey) && nKey !== targetKey) continue;
      if (!isNavigableTile(n.q, n.r, gridW, gridH)) continue;

      const terrain = getTileTerrain(n.q, n.r);
      const cost = getMovementCost(terrain);
      if (cost === Infinity) continue;
      const totalCost = currentEntry.cost + cost;
      if (totalCost > maxCost) continue;

      visited.set(nKey, { parent: currentKey, q: n.q, r: n.r, cost: totalCost });

      if (nKey === targetKey) {
        const path = [];
        let cursor = targetKey;
        while (cursor !== null) {
          const entry = visited.get(cursor);
          path.unshift({ q: entry.q, r: entry.r });
          cursor = entry.parent;
        }
        return path;
      }

      queue.push({ q: n.q, r: n.r });
    }
  }

  return null;
}

export { HEX_RADIUS };

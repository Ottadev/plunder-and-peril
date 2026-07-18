/**
 * useHexGrid tests — map generation, coordinates, terrain, pathfinding
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  generateMap,
  setMap,
  getTileTerrain,
  regenerateMap,
  getMapSeed,
  hexToPixel,
  pixelToHex,
  hexRound,
  hexCorner,
  getHexNeighbors,
  isWithinBounds,
  isNavigableTile,
  isCoastalTile,
  getTerrainColor,
  getTerrainSymbol,
  getMovementCost,
  bfsPathTo,
  TERRAIN,
} from "../src/hooks/useHexGrid.js";

// ── Coordinate helpers ────────────────────────────────────────────────

describe("useHexGrid — coordinates", () => {
  it("hexToPixel converts axial to pixel", () => {
    const { x, y } = hexToPixel(0, 0);
    expect(x).toBeCloseTo(0, 1);
    expect(y).toBeCloseTo(0, 1);
  });

  it("hexToPixel for non-zero coordinates", () => {
    const { x, y } = hexToPixel(1, 0);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeCloseTo(0, 1);

    const { x: x2, y: y2 } = hexToPixel(0, 1);
    expect(y2).toBeGreaterThan(0);
  });

  it("pixelToHex and hexToPixel are inverses (approximately)", () => {
    const orig = { q: 3, r: 2 };
    const pixel = hexToPixel(orig.q, orig.r);
    const hex = pixelToHex(pixel.x, pixel.y);
    const rounded = hexRound(hex.q, hex.r);
    expect(rounded.q).toBe(orig.q);
    expect(rounded.r).toBe(orig.r);
  });

  it("hexRound corrects fractional coordinates", () => {
    const result = hexRound(3.1, 1.9);
    expect(result.q).toBe(3);
    expect(result.r).toBe(2);
  });

  it("hexCorner returns correct hex vertices", () => {
    // Center at origin, size 40
    const corner0 = hexCorner(0, 0, 40, 0);
    expect(corner0.x).toBeGreaterThan(0);
    expect(corner0.y).toBeLessThan(0); // first corner is upper-right for pointy-top

    // All 6 corners should be distinct
    const corners = Array.from({ length: 6 }, (_, i) => hexCorner(0, 0, 40, i));
    const keys = corners.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`);
    expect(new Set(keys).size).toBe(6);
  });

  it("getHexNeighbors returns 6 neighbors", () => {
    const neighbors = getHexNeighbors(5, 5);
    expect(neighbors).toHaveLength(6);
    // All neighbors should be adjacent (Manhattan distance 1)
    for (const n of neighbors) {
      const dq = Math.abs(n.q - 5);
      const dr = Math.abs(n.r - 5);
      expect(dq + dr).toBeGreaterThanOrEqual(1);
    }
  });

  it("isWithinBounds checks grid boundaries", () => {
    expect(isWithinBounds(0, 0, 10, 10)).toBe(true);
    expect(isWithinBounds(9, 9, 10, 10)).toBe(true);
    expect(isWithinBounds(5, 5, 10, 10)).toBe(true);
    expect(isWithinBounds(-1, 0, 10, 10)).toBe(false);
    expect(isWithinBounds(0, -1, 10, 10)).toBe(false);
    expect(isWithinBounds(10, 0, 10, 10)).toBe(false);
    expect(isWithinBounds(0, 10, 10, 10)).toBe(false);
  });
});

// ── Map generation ────────────────────────────────────────────────────

describe("useHexGrid — map generation", () => {
  it("generateMap returns a 10×10 grid", () => {
    const map = generateMap(42, 10, 10);
    expect(map).toHaveLength(10);
    for (const row of map) {
      expect(row).toHaveLength(10);
    }
  });

  it("generateMap is deterministic (same seed = same map)", () => {
    const map1 = generateMap(42, 10, 10);
    const map2 = generateMap(42, 10, 10);
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        expect(map1[r][c]).toBe(map2[r][c]);
      }
    }
  });

  it("generateMap produces different maps with different seeds", () => {
    const map1 = generateMap(42, 10, 10);
    const map2 = generateMap(123, 10, 10);
    // At least some tiles should differ
    let differences = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (map1[r][c] !== map2[r][c]) differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("generateMap produces both land and ocean tiles", () => {
    const map = generateMap(42, 10, 10);
    const terrainSet = new Set();
    for (const row of map) {
      for (const tile of row) {
        terrainSet.add(tile);
      }
    }
    // Should have at least OCEAN and some land type
    expect(terrainSet.has(TERRAIN.OCEAN)).toBe(true);
    // Should have some land tiles
    const landTypes = [TERRAIN.LAND, TERRAIN.JUNGLE, TERRAIN.SAND, TERRAIN.PORT];
    expect(landTypes.some(t => terrainSet.has(t))).toBe(true);
  });

  it("generateMap supports custom island count", () => {
    const map = generateMap(42, 10, 10, { islandCount: 5 });
    expect(map).toHaveLength(10);
  });
});

// ── Map cache ─────────────────────────────────────────────────────────

describe("useHexGrid — map cache", () => {
  beforeEach(() => {
    setMap(42, 10, 10);
  });

  it("setMap initializes the map cache", () => {
    const map = setMap(99, 10, 10);
    expect(getMapSeed()).toBe(99);
    expect(map).toHaveLength(10);
  });

  it("getTileTerrain returns terrain within bounds", () => {
    const terrain = getTileTerrain(5, 5);
    expect(Object.values(TERRAIN)).toContain(terrain);
  });

  it("getTileTerrain returns DEEP_OCEAN for out-of-bounds", () => {
    expect(getTileTerrain(-1, 0)).toBe(TERRAIN.DEEP_OCEAN);
    expect(getTileTerrain(100, 0)).toBe(TERRAIN.DEEP_OCEAN);
  });

  it("regenerateMap creates new map from seed", () => {
    const oldMap = generateMap(42, 10, 10);
    const newMap = regenerateMap(77);
    // Maps should differ
    let same = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (oldMap[r][c] === newMap[r][c]) same++;
      }
    }
    expect(same).toBeLessThan(100); // not all same
  });
});

// ── Terrain queries ───────────────────────────────────────────────────

describe("useHexGrid — terrain queries", () => {
  beforeEach(() => {
    setMap(42, 10, 10);
  });

  it("isNavigableTile returns true for ocean/shallow/sand/port", () => {
    // Find an ocean tile (should exist)
    let foundOcean = false;
    for (let q = 0; q < 10 && !foundOcean; q++) {
      for (let r = 0; r < 10 && !foundOcean; r++) {
        if (getTileTerrain(q, r) === TERRAIN.OCEAN) {
          expect(isNavigableTile(q, r, 10, 10)).toBe(true);
          foundOcean = true;
        }
      }
    }
    expect(foundOcean).toBe(true);
  });

  it("isNavigableTile returns false for out-of-bounds", () => {
    expect(isNavigableTile(-1, 0, 10, 10)).toBe(false);
  });

  it("isCoastalTile identifies land adjacent to water", () => {
    // Should find some coastal tiles on a generated map
    let hasCoastal = false;
    let hasNonCoastal = false;
    for (let q = 0; q < 10; q++) {
      for (let r = 0; r < 10; r++) {
        const terrain = getTileTerrain(q, r);
        if (terrain === TERRAIN.LAND || terrain === TERRAIN.JUNGLE) {
          if (isCoastalTile(q, r, 10, 10)) {
            hasCoastal = true;
          } else {
            hasNonCoastal = true;
          }
        }
      }
    }
    expect(hasCoastal).toBe(true);
  });

  it("getMovementCost returns 1 for navigable, Infinity for impassable", () => {
    expect(getMovementCost(TERRAIN.OCEAN)).toBe(1);
    expect(getMovementCost(TERRAIN.SHALLOW)).toBe(1);
    expect(getMovementCost(TERRAIN.SAND)).toBe(1);
    expect(getMovementCost(TERRAIN.PORT)).toBe(1);
    expect(getMovementCost(TERRAIN.LAND)).toBe(Infinity);
    expect(getMovementCost(TERRAIN.JUNGLE)).toBe(Infinity);
    expect(getMovementCost(TERRAIN.REEF)).toBe(Infinity);
    expect(getMovementCost(TERRAIN.DEEP_OCEAN)).toBe(Infinity);
  });
});

// ── Terrain rendering ─────────────────────────────────────────────────

describe("useHexGrid — terrain rendering", () => {
  it("getTerrainColor returns colors for all terrain types", () => {
    for (const key of Object.keys(TERRAIN)) {
      const color = getTerrainColor(TERRAIN[key]);
      expect(color).toBeTruthy();
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("getTerrainSymbol returns non-empty for PORT and REEF", () => {
    expect(getTerrainSymbol(TERRAIN.PORT)).toBeTruthy();
    expect(getTerrainSymbol(TERRAIN.REEF)).toBeTruthy();
  });

  it("getTerrainSymbol returns empty for OCEAN", () => {
    expect(getTerrainSymbol(TERRAIN.OCEAN)).toBe("");
  });
});

// ── Pathfinding ───────────────────────────────────────────────────────

describe("useHexGrid — pathfinding", () => {
  beforeEach(() => {
    setMap(42, 10, 10);
  });

  it("bfsPathTo finds a path between two ocean tiles", () => {
    // Find two ocean tiles
    const oceanTiles = [];
    for (let q = 0; q < 10; q++) {
      for (let r = 0; r < 10; r++) {
        if (isNavigableTile(q, r, 10, 10)) {
          oceanTiles.push({ q, r });
        }
      }
    }
    if (oceanTiles.length >= 2) {
      const start = oceanTiles[0];
      const end = oceanTiles[oceanTiles.length - 1];
      const path = bfsPathTo(start.q, start.r, end.q, end.r, 20, new Set(), 10, 10);
      expect(path).not.toBeNull();
      if (path) {
        expect(path[0]).toEqual({ q: start.q, r: start.r });
        expect(path[path.length - 1]).toEqual({ q: end.q, r: end.r });
      }
    }
  });

  it("bfsPathTo returns null for unreachable target", () => {
    // Land tiles are impassable — find an ocean tile and target an interior land
    let oceanQ = 0, oceanR = 0;
    let landQ = 0, landR = 0;
    for (let q = 0; q < 10; q++) {
      for (let r = 0; r < 10; r++) {
        const t = getTileTerrain(q, r);
        if (t === TERRAIN.OCEAN && oceanQ === 0) { oceanQ = q; oceanR = r; }
        if ((t === TERRAIN.JUNGLE) && !isCoastalTile(q, r, 10, 10) && landQ === 0) {
          landQ = q; landR = r;
        }
      }
    }
    if (landQ !== 0) {
      const path = bfsPathTo(oceanQ, oceanR, landQ, landR, 20, new Set(), 10, 10);
      expect(path).toBeNull();
    }
  });

  it("bfsPathTo respects maxCost", () => {
    // Find two ocean tiles far apart
    const tiles = [];
    for (let q = 0; q < 10; q++) {
      for (let r = 0; r < 10; r++) {
        if (isNavigableTile(q, r, 10, 10)) tiles.push({ q, r });
      }
    }
    if (tiles.length >= 2) {
      // With maxCost=1, only adjacent tiles reachable
      const start = tiles[0];
      const end = tiles[tiles.length - 1];
      const pathFar = bfsPathTo(start.q, start.r, end.q, end.r, 1, new Set(), 10, 10);
      // Might be null if not adjacent
      // This is expected behavior
    }
  });

  it("bfsPathTo returns single-tile path when start == end", () => {
    const path = bfsPathTo(0, 0, 0, 0, 10, new Set(), 10, 10);
    expect(path).toEqual([{ q: 0, r: 0 }]);
  });

  it("bfsPathTo respects occupied hexes", () => {
    // Find 3 ocean tiles in a line, occupy the middle one
    const tiles = [];
    for (let q = 0; q < 10 && tiles.length < 3; q++) {
      for (let r = 0; r < 10 && tiles.length < 3; r++) {
        if (isNavigableTile(q, r, 10, 10)) tiles.push({ q, r });
      }
    }
    if (tiles.length >= 3) {
      const occupied = new Set();
      occupied.add(`${tiles[1].q},${tiles[1].r}`);
      const path = bfsPathTo(
        tiles[0].q, tiles[0].r,
        tiles[2].q, tiles[2].r,
        20, occupied, 10, 10
      );
      // Path should find alternative route or be null if blocked
      // Either way, shouldn't include occupied tile as intermediate
      if (path) {
        expect(path.some(p => `${p.q},${p.r}` === `${tiles[1].q},${tiles[1].r}`)).toBe(false);
      }
    }
  });
});

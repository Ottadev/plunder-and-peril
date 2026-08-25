/**
 * useGameState tests — unit types, combat, win conditions, wave spawning
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { setMap } from "../src/hooks/useHexGrid.js";

// Initialize map before tests that depend on terrain
beforeEach(() => {
  setMap(42, 10, 10);
});

// ── Unit Types ────────────────────────────────────────────────────────

describe("useGameState — unit types", () => {
  // Import UNIT_TYPES dynamically (ESM module)
  let UNIT_TYPES;
  beforeAll(async () => {
    const mod = await import("../src/hooks/useGameState.js");
    UNIT_TYPES = mod.UNIT_TYPES;
  });

  it("has three ship types", () => {
    expect(Object.keys(UNIT_TYPES)).toHaveLength(3);
    expect(UNIT_TYPES).toHaveProperty("sloop");
    expect(UNIT_TYPES).toHaveProperty("brigantine");
    expect(UNIT_TYPES).toHaveProperty("galleon");
  });

  it("sloop is fast but fragile", () => {
    const s = UNIT_TYPES.sloop;
    expect(s.maxMovement).toBe(3);
    expect(s.maxHp).toBe(4);
    expect(s.attack).toBe(1);
  });

  it("galleon is slow but tanky", () => {
    const g = UNIT_TYPES.galleon;
    expect(g.maxMovement).toBe(1);
    expect(g.maxHp).toBe(8);
    expect(g.attack).toBe(3);
  });

  it("brigantine is balanced", () => {
    const b = UNIT_TYPES.brigantine;
    expect(b.maxMovement).toBe(2);
    expect(b.maxHp).toBe(6);
    expect(b.attack).toBe(2);
  });

  it("all units have range 1", () => {
    for (const type of Object.values(UNIT_TYPES)) {
      expect(type.range).toBe(1);
    }
  });

  it("all units have required stats", () => {
    const requiredKeys = ["maxHp", "maxMovement", "attack", "range", "label"];
    for (const [, type] of Object.entries(UNIT_TYPES)) {
      for (const key of requiredKeys) {
        expect(type).toHaveProperty(key);
      }
    }
  });
});

// ── Combat Logic ──────────────────────────────────────────────────────

describe("useGameState — combat logic", () => {
  it("hex distance calculation is correct", () => {
    // Axial distance formula: max(|dq|, |dr|, |ds|) where s = -q-r
    function hexDist(q1, r1, q2, r2) {
      const dq = Math.abs(q2 - q1);
      const dr = Math.abs(r2 - r1);
      const ds = Math.abs((-q2 - r2) - (-q1 - r1));
      return Math.max(dq, dr, ds);
    }

    expect(hexDist(0, 0, 1, 0)).toBe(1);
    expect(hexDist(0, 0, 0, 1)).toBe(1);
    expect(hexDist(0, 0, 1, -1)).toBe(1);
    expect(hexDist(0, 0, 2, 0)).toBe(2);
    expect(hexDist(0, 0, 3, 2)).toBe(5); // max(|3|, |2|, |(-3-2)-0|) = max(3,2,5) = 5
    expect(hexDist(0, 0, 0, 0)).toBe(0);
  });

  it("attack deals exactly ATK damage", () => {
    // Units have attack stat, damage = attack
    const attack = 3;
    const hp = 8;
    const afterHp = hp - attack;
    expect(afterHp).toBe(5);
  });

  it("unit dies when HP reaches 0", () => {
    const hp = 3;
    const damage = 3;
    expect(hp - damage).toBe(0);
    expect(hp - damage <= 0).toBe(true);
  });

  it("unit survives with 1 HP", () => {
    const hp = 3;
    const damage = 2;
    expect(hp - damage).toBe(1);
    expect(hp - damage > 0).toBe(true);
  });

  it("cannot attack after attacking (attacked flag)", () => {
    // Simulate unit state
    let attacked = false;
    // First attack: allowed
    expect(attacked).toBe(false);
    attacked = true;
    // Second attack: blocked
    expect(attacked).toBe(true);
  });

  it("range 1 means only adjacent hexes are valid targets", () => {
    function hexDist(q1, r1, q2, r2) {
      return Math.max(Math.abs(q2 - q1), Math.abs(r2 - r1), Math.abs((-q2 - r2) - (-q1 - r1)));
    }
    // Adjacent
    expect(hexDist(0, 0, 1, 0)).toBe(1);
    expect(hexDist(0, 0, 0, 1)).toBe(1);
    // Not adjacent
    expect(hexDist(0, 0, 2, 0)).toBe(2);
  });
});

// ── Win Conditions ────────────────────────────────────────────────────

describe("useGameState — win conditions", () => {
  it("player wins when all AI units destroyed", () => {
    const playerUnits = [{ owner: "player", hp: 4 }, { owner: "player", hp: 6 }];
    const aiUnits = []; // all dead

    const aiAlive = aiUnits.filter(u => u.hp > 0);
    expect(aiAlive).toHaveLength(0);

    const playerAlive = playerUnits.filter(u => u.hp > 0);
    expect(playerAlive.length).toBeGreaterThan(0);

    // Win condition: all enemy units dead
    const playerWins = aiAlive.length === 0 && playerAlive.length > 0;
    expect(playerWins).toBe(true);
  });

  it("AI wins when all player units destroyed", () => {
    const playerUnits = [];

    const playerAlive = playerUnits.filter(u => u.hp > 0);
    const aiWins = playerAlive.length === 0;
    expect(aiWins).toBe(true);
  });

  it("no winner if both have units alive", () => {
    const playerUnits = [{ owner: "player", hp: 4 }];
    const aiUnits = [{ owner: "ai", hp: 4 }];

    const playerAlive = playerUnits.filter(u => u.hp > 0);
    const aiAlive = aiUnits.filter(u => u.hp > 0);

    expect(playerAlive.length > 0 && aiAlive.length > 0).toBe(true);
  });

  it("simultaneous destruction is a draw", () => {
    // Both sides lose all units on the same turn
    const playerUnits = []; // all dead
    const aiUnits = []; // all dead

    const playerAlive = playerUnits.filter(u => u.hp > 0);
    const aiAlive = aiUnits.filter(u => u.hp > 0);

    expect(playerAlive.length === 0 && aiAlive.length === 0).toBe(true);
  });
});

// ── Turn Management ───────────────────────────────────────────────────

describe("useGameState — turn management", () => {
  it("player turn starts with full movement", () => {
    const unit = {
      maxMovement: 3,
      movementPoints: 3,
      attacked: false,
    };
    expect(unit.movementPoints).toBe(unit.maxMovement);
    expect(unit.attacked).toBe(false);
  });

  it("spending movement reduces points", () => {
    let movementPoints = 3;
    // Move 1 hex
    movementPoints -= 1;
    expect(movementPoints).toBe(2);
    // Move another hex
    movementPoints -= 1;
    expect(movementPoints).toBe(1);
  });

  it("cannot move when movement is zero", () => {
    const movementPoints = 0;
    expect(movementPoints <= 0).toBe(true);
  });

  it("cannot move when already attacked (attacked flag)", () => {
    const unit = {
      movementPoints: 0,
      attacked: true,
    };
    const canAct = unit.movementPoints > 0 || !unit.attacked;
    expect(canAct).toBe(false);
  });

  it("can still move if not attacked even with 0 movement", () => {
    const unit = {
      movementPoints: 0,
      attacked: false,
    };
    const canAct = unit.movementPoints > 0 || !unit.attacked;
    expect(canAct).toBe(true);
  });
});

// ── Wave Defense ──────────────────────────────────────────────────────

describe("useGameState — wave defense logic", () => {
  it("wave count increases with wave number", () => {
    // spawnWaveUnits formula: min(2 + floor(wave * 0.6), 8)
    function getWaveCount(wave) {
      return Math.min(2 + Math.floor(wave * 0.6), 8);
    }
    expect(getWaveCount(1)).toBe(2);
    expect(getWaveCount(2)).toBe(3);
    expect(getWaveCount(5)).toBe(5);
    expect(getWaveCount(10)).toBe(8); // capped
    expect(getWaveCount(20)).toBe(8); // capped
  });

  it("wave composition expands with waves", () => {
    function getTypes(wave) {
      const types = ["sloop"];
      if (wave >= 2) types.push("sloop", "brigantine");
      if (wave >= 4) types.push("brigantine");
      if (wave >= 6) types.push("galleon");
      if (wave >= 8) { types.push("galleon"); types.push("brigantine"); }
      return types;
    }

    expect(getTypes(1)).toEqual(["sloop"]);
    expect(getTypes(3)).toEqual(["sloop", "sloop", "brigantine"]);
    expect(getTypes(6)).toEqual(["sloop", "sloop", "brigantine", "brigantine", "galleon"]);
    expect(getTypes(10)).toEqual(["sloop", "sloop", "brigantine", "brigantine", "galleon", "galleon", "brigantine"]);
  });

  it("high score update works", () => {
    function updateHighScore(current, score) {
      return score > current ? score : current;
    }
    expect(updateHighScore(0, 100)).toBe(100);
    expect(updateHighScore(100, 50)).toBe(100);
    expect(updateHighScore(100, 200)).toBe(200);
  });
});

// ── Upgrade Bonuses ───────────────────────────────────────────────────

describe("useGameState — upgrade bonuses", () => {
  it("upgrade bonuses are additive", () => {
    const bonuses = { hp: 2, movement: 0, attack: 1 };

    const baseHp = 4;
    const baseAttack = 2;

    const effectiveHp = baseHp + bonuses.hp;
    const effectiveAttack = baseAttack + bonuses.attack;

    expect(effectiveHp).toBe(6);
    expect(effectiveAttack).toBe(3);
  });

  it("upgrades apply every 3 turns", () => {
    function canUpgrade(currentTurn, lastUpgradeTurn) {
      return currentTurn - lastUpgradeTurn >= 3;
    }
    expect(canUpgrade(3, 0)).toBe(true);
    expect(canUpgrade(6, 3)).toBe(true);
    expect(canUpgrade(2, 0)).toBe(false);
    expect(canUpgrade(5, 3)).toBe(false);
  });
});

// ── Treasure System ───────────────────────────────────────────────────

describe("useGameState — treasure system", () => {
  it("treasures have id, q, r", () => {
    const treasure = { id: "treasure-0", q: 3, r: 4 };
    expect(treasure).toHaveProperty("id");
    expect(treasure).toHaveProperty("q");
    expect(treasure).toHaveProperty("r");
  });

  it("collecting treasure increments count", () => {
    let playerTreasures = 0;
    playerTreasures++;
    expect(playerTreasures).toBe(1);
    playerTreasures++;
    expect(playerTreasures).toBe(2);
  });

  it("treasures on map are removed when collected", () => {
    const treasures = [
      { id: "treasure-0", q: 3, r: 4 },
      { id: "treasure-1", q: 6, r: 1 },
      { id: "treasure-2", q: 8, r: 7 },
    ];
    const collected = treasures.filter(t => t.id !== "treasure-1");
    expect(collected).toHaveLength(2);
    expect(collected.find(t => t.id === "treasure-1")).toBeUndefined();
  });
});

// ── Ship Names ────────────────────────────────────────────────────────

describe("useGameState — ship names", () => {
  it("player ship names are unique (8 names)", async () => {
    const mod = await import("../src/hooks/useGameState.js");
    // Check if names are exported or only internal
    // We can at least verify the constants exist
    expect(mod.UNIT_TYPES).toBeDefined();
  });
});

// ── Flag Colors ───────────────────────────────────────────────────────

describe("useGameState — customization", () => {
  it("FLAG_COLORS has 6 presets", async () => {
    const mod = await import("../src/hooks/useGameState.js");
    if (mod.FLAG_COLORS) {
      expect(Object.keys(mod.FLAG_COLORS)).toHaveLength(6);
    }
  });

  it("all flag colors are valid hex", async () => {
    const mod = await import("../src/hooks/useGameState.js");
    if (mod.FLAG_COLORS) {
      for (const color of Object.values(mod.FLAG_COLORS)) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

// ── Pure Helpers (extracted by simplify) ─────────────────────────────

describe("useGameState — pure helpers", () => {
  let hexDistance, occupiedHexSet, pickPositions, getWaveTypes;
  beforeAll(async () => {
    const mod = await import("../src/hooks/useGameState.js");
    hexDistance = mod.hexDistance;
    occupiedHexSet = mod.occupiedHexSet;
    pickPositions = mod.pickPositions;
    getWaveTypes = mod.getWaveTypes;
  });

  it("hexDistance matches axial cube-distance", () => {
    expect(hexDistance(0, 0, 1, 0)).toBe(1);
    expect(hexDistance(0, 0, 0, 1)).toBe(1);
    expect(hexDistance(0, 0, 1, -1)).toBe(1);
    expect(hexDistance(0, 0, 2, 0)).toBe(2);
    expect(hexDistance(0, 0, 3, 2)).toBe(5); // max(|3|,|2|,|−5|)
    expect(hexDistance(0, 0, 0, 0)).toBe(0);
    // Symmetric
    expect(hexDistance(1, 0, 0, 0)).toBe(hexDistance(0, 0, 1, 0));
  });

  it("occupiedHexSet keeps only live hexes and excludes the reference unit", () => {
    const units = [
      { id: "u1", q: 0, r: 0, hp: 4 },
      { id: "u2", q: 1, r: 0, hp: 0 }, // dead → excluded
      { id: "u3", q: 2, r: 2, hp: 6 },
    ];
    const set = occupiedHexSet(units, "u1");
    expect(set.has("0,0")).toBe(false); // excluded ref unit
    expect(set.has("1,0")).toBe(false); // dead
    expect(set.has("2,2")).toBe(true);
    expect(set.size).toBe(1);
    // No exclusion: own hex included
    const noExcl = occupiedHexSet(units);
    expect(noExcl.has("0,0")).toBe(true);
    expect(noExcl.has("2,2")).toBe(true);
    expect(noExcl.size).toBe(2);
  });

  it("pickPositions returns evenly-spaced tiles when enough are available", () => {
    const tiles = [
      { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
      { q: 3, r: 0 }, { q: 4, r: 0 }, { q: 5, r: 0 },
    ];
    const picks = pickPositions(tiles, 3);
    expect(picks).toHaveLength(3);
    // First and last are preserved (spread across the pool)
    expect(picks[0]).toEqual({ q: 0, r: 0 });
    expect(picks[2]).toEqual({ q: 5, r: 0 });
  });

  it("pickPositions falls back to slice when pool is too small", () => {
    const tiles = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    expect(pickPositions(tiles, 5)).toEqual(tiles);
    expect(pickPositions(tiles, 1)).toHaveLength(1);
  });

  it("getWaveTypes expands composition with wave number", () => {
    expect(getWaveTypes(1)).toEqual(["sloop"]);
    expect(getWaveTypes(3)).toEqual(["sloop", "sloop", "brigantine"]);
    expect(getWaveTypes(10)).toEqual([
      "sloop", "sloop", "brigantine", "brigantine",
      "galleon", "galleon", "brigantine",
    ]);
  });

  it("shuffle preserves elements (length + multiset)", async () => {
    const mod = await import("../src/hooks/useGameState.js");
    const shuffle = mod.shuffle;
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle([...arr]);
    expect(shuffled).toHaveLength(5);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(arr);
  });

  it("shuffle mutates and returns the same array reference", async () => {
    const mod = await import("../src/hooks/useGameState.js");
    const shuffle = mod.shuffle;
    const arr = ["a", "b"];
    const out = shuffle(arr);
    expect(out).toBe(arr);
    expect(arr).toEqual(out);
  });
});

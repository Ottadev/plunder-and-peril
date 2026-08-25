import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getTileTerrain,
  getHexNeighbors,
  isWithinBounds,
  isCoastalTile,
  isNavigableTile,
  getMovementCost,
  getTerrainDefense,
  setMap,
  TERRAIN,
  bfsPathTo,
} from './useHexGrid.js';
const GRID_WIDTH = 10;
const GRID_HEIGHT = 10;

/**
 * Unit type definitions: stats for each ship class.
 */
export const UNIT_TYPES = {
  sloop:      { maxHp: 4, maxMovement: 3, attack: 1, range: 1, label: 'Sloop', ability: 'recon', abilityLabel: 'Ricognizione', abilityCooldown: 3, abilityDesc: 'Rivela 3 tile nella nebbia (raggio 3)' },
  brigantine: { maxHp: 6, maxMovement: 2, attack: 2, range: 1, label: 'Brigantine', ability: 'focusFire', abilityLabel: 'Fuoco Concentrato', abilityCooldown: 3, abilityDesc: '+50% danno nel prossimo attacco' },
  galleon:    { maxHp: 8, maxMovement: 1, attack: 3, range: 1, label: 'Galleon', ability: 'shield', abilityLabel: 'Scudo', abilityCooldown: 3, abilityDesc: 'Protegge alleati adiacenti (-2 danni subiti per 1 turno)' },
};

let nextUnitId = 1;

// Ship name pools
const PLAYER_SHIP_NAMES = [
  'Sea Serpent', 'Red Dawn', 'Iron Tide', 'Crimson Wind',
  'Shadow Hawk', 'Storm Breaker', 'Ocean Fury', 'Silver Star',
];
const AI_SHIP_NAMES = [
  'Black Raider', 'Cursed Blade', 'Death Knell', 'Rusty Hook',
  'Skeleton Key', 'Davy Jones', 'Blood Tide', 'Dark Omen',
];
let playerNameIndex = 0;
let aiNameIndex = 0;

function createUnit(type, owner, q, r, customName) {
  const def = UNIT_TYPES[type];
  const namePool = owner === 'player' ? PLAYER_SHIP_NAMES : AI_SHIP_NAMES;
  const idx = owner === 'player' ? playerNameIndex++ : aiNameIndex++;
  const name = customName || namePool[idx % namePool.length] || `${def.label}`;
  return {
    id: `unit-${nextUnitId++}`,
    type,
    owner,
    shipName: name,
    q,
    r,
    hp: def.maxHp,
    maxHp: def.maxHp,
    movementPoints: def.maxMovement,
    maxMovement: def.maxMovement,
    attack: def.attack,
    range: def.range,
    attacked: false,
    abilityReady: true,      // ability is ready if not on cooldown
    abilityCooldownTurns: 0,  // turns until ability is ready again
    shieldedUntilTurn: 0,     // turn number until shield effect expires
    focusFireReady: false,    // next attack gets +50% damage
  };
}

/** Hex distance between two axial coordinates (max of |dq|,|dr|,|ds|). */
export function hexDistance(q1, r1, q2, r2) {
  const dq = Math.abs(q2 - q1);
  const dr = Math.abs(r2 - r1);
  const ds = Math.abs((-q2 - r2) - (-q1 - r1));
  return Math.max(dq, dr, ds);
}

/** Build the set of "q,r" hexes occupied by live units, optionally excluding one unit. */
export function occupiedHexSet(units, excludeUnitId) {
  const occupied = new Set();
  units.forEach(u => {
    if (u.id !== excludeUnitId && u.hp > 0) {
      occupied.add(`${u.q},${u.r}`);
    }
  });
  return occupied;
}

/** In-place Fisher–Yates shuffle. Returns the same array for chaining. */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick `count` evenly-spaced tiles from a candidate list (falls back to slice). */
export function pickPositions(tiles, count) {
  if (tiles.length >= count) {
    const step = (tiles.length - 1) / Math.max(count - 1, 1);
    const selected = [];
    for (let i = 0; i < count; i++) {
      selected.push(tiles[Math.round(i * step)]);
    }
    return selected;
  }
  return tiles.slice(0, count);
}

/** Wave enemy composition grows with the wave number. */
export function getWaveTypes(wave) {
  const types = ['sloop'];
  if (wave >= 2) types.push('sloop', 'brigantine');
  if (wave >= 4) types.push('brigantine');
  if (wave >= 6) types.push('galleon');
  if (wave >= 8) { types.push('galleon'); types.push('brigantine'); }
  return types;
}

/**
 * Find all navigable spawn tiles (ocean or shallow) within a given column range.
 */
function findOceanTilesInColumns(minQ, maxQ) {
  const tiles = [];
  for (let q = minQ; q <= maxQ; q++) {
    for (let r = 0; r < GRID_HEIGHT; r++) {
      const terrain = getTileTerrain(q, r);
      if (terrain === TERRAIN.OCEAN || terrain === TERRAIN.SHALLOW) {
        tiles.push({ q, r });
      }
    }
  }
  return tiles;
}

/**
 * Create initial unit placements for both players.
 * Player starts on left side, AI on right side, on ocean tiles.
 */
function createInitialUnits(flagshipName) {
  // Find ocean tiles on left (q 0-3) and right (q 6-9) sides
  const leftTiles = findOceanTilesInColumns(0, 3);
  const rightTiles = findOceanTilesInColumns(6, 9);

  // Spread units out across available ocean tiles
  const playerPositions = pickPositions(leftTiles, 3);
  const aiPositions = pickPositions(rightTiles, 3);

  return [
    // Player units
    createUnit('galleon',    'player', playerPositions[0].q, playerPositions[0].r, flagshipName),
    createUnit('brigantine', 'player', playerPositions[1].q, playerPositions[1].r),
    createUnit('sloop',      'player', playerPositions[2].q, playerPositions[2].r),
    // AI units
    createUnit('galleon',    'ai',     aiPositions[0].q, aiPositions[0].r),
    createUnit('brigantine', 'ai',     aiPositions[1].q, aiPositions[1].r),
    createUnit('sloop',      'ai',     aiPositions[2].q, aiPositions[2].r),
  ];
}

/**
 * Find all coastal land/jungle tiles reachable by ships.
 * These are valid treasure locations — ships can dock there.
 */
function findTreasureLocations() {
  const tiles = [];
  for (let q = 0; q < GRID_WIDTH; q++) {
    for (let r = 0; r < GRID_HEIGHT; r++) {
      const terrain = getTileTerrain(q, r);
      // Treasures on land tiles that are coastal (accessible by ships)
      if (terrain !== TERRAIN.OCEAN && terrain !== TERRAIN.SHALLOW &&
          terrain !== TERRAIN.DEEP_OCEAN && terrain !== TERRAIN.REEF &&
          isCoastalTile(q, r, GRID_WIDTH, GRID_HEIGHT)) {
        tiles.push({ q, r });
      }
    }
  }
  return tiles;
}

/**
 * Generate 1-3 treasures on coastal land tiles, avoiding unit spawn positions.
 * Treasures are placed in reachable but non-trivial positions.
 */
function generateTreasures(unitPositions) {
  const candidates = findTreasureLocations();
  const occupiedSet = new Set(unitPositions.map(p => `${p.q},${p.r}`));
  const available = candidates.filter(t => !occupiedSet.has(`${t.q},${t.r}`));

  // Shuffle available tiles using Fisher-Yates
  shuffle(available);

  // Pick 1-3 treasures, biased toward 2-3 for meaningful gameplay
  const count = Math.min(available.length, 1 + Math.floor(Math.random() * 3));
  return available.slice(0, count).map((pos, i) => ({
    id: `treasure-${i}`,
    q: pos.q,
    r: pos.r,
  }));
}

/**
 * Compute all hexes visible from a set of units with a given vision range.
 * Uses BFS limited to `visionRange` hexes from each unit, ignoring terrain (you can see over land).
 */
function computeVisibleHexes(units, visionRange = 2) {
  const visible = new Set();
  const key = (q, r) => `${q},${r}`;

  for (const unit of units) {
    if (unit.hp <= 0) continue;
    // BFS from unit position, capped at visionRange
    const visited = new Set();
    const queue = [{ q: unit.q, r: unit.r, dist: 0 }];
    visited.add(key(unit.q, unit.r));
    visible.add(key(unit.q, unit.r));

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.dist >= visionRange) continue;
      const neighbors = getHexNeighbors(cur.q, cur.r);
      for (const n of neighbors) {
        const nk = key(n.q, n.r);
        if (visited.has(nk)) continue;
        if (!isWithinBounds(n.q, n.r, GRID_WIDTH, GRID_HEIGHT)) continue;
        visited.add(nk);
        visible.add(nk);
        queue.push({ q: n.q, r: n.r, dist: cur.dist + 1 });
      }
    }
  }
  return visible;
}

/**
 * Run BFS to find all hexes reachable by a unit given its remaining movement points,
 * terrain costs, and occupancy.
 */
function bfsValidMoves(unit, allUnits) {
  const occupied = occupiedHexSet(allUnits, unit.id);

  const visited = new Set();
  const reachable = [];
  const key = (q, r) => `${q},${r}`;

  visited.add(key(unit.q, unit.r));
  const queue = [{ q: unit.q, r: unit.r, remaining: unit.movementPoints }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.q !== unit.q || current.r !== unit.r) {
      reachable.push({ q: current.q, r: current.r });
    }

    if (current.remaining <= 0) continue;

    const neighbors = getHexNeighbors(current.q, current.r);
    for (const n of neighbors) {
      const nKey = key(n.q, n.r);
      if (visited.has(nKey)) continue;
      if (!isWithinBounds(n.q, n.r, GRID_WIDTH, GRID_HEIGHT)) continue;

      // Only navigable terrain (ocean, shallow, sand, port) is traversable
      const terrain = getTileTerrain(n.q, n.r);
      if (!isNavigableTile(n.q, n.r, GRID_WIDTH, GRID_HEIGHT)) continue;

      // Cannot move onto occupied hex
      if (occupied.has(nKey)) continue;

      const cost = getMovementCost(terrain);
      if (current.remaining >= cost) {
        visited.add(nKey);
        queue.push({ q: n.q, r: n.r, remaining: current.remaining - cost });
      }
    }
  }

  return reachable;
}

/**
 * Find enemy units within attack range of the given unit.
 */
function getValidTargets(unit, allUnits) {
  if (unit.attacked) return [];
  return allUnits.filter(u => {
    if (u.owner === unit.owner || u.hp <= 0) return false;
    // Calculate hex distance (axial → cube distance)
    const dist = hexDistance(unit.q, unit.r, u.q, u.r);
    return dist <= unit.range;
  });
}

/**
 * Read customization from localStorage.
 */
function getCustomization() {
  try {
    return {
      captainName: localStorage.getItem('plunder-captain') || 'Captain Ed',
      flagColor: localStorage.getItem('plunder-flag') || '#4488ff',
      flagshipName: localStorage.getItem('plunder-flagship') || '',
    };
  } catch {
    return { captainName: 'Captain Ed', flagColor: '#4488ff', flagshipName: '' };
  }
}

function saveCustomization(captainName, flagColor, flagshipName) {
  try {
    localStorage.setItem('plunder-captain', captainName);
    localStorage.setItem('plunder-flag', flagColor);
    if (flagshipName) localStorage.setItem('plunder-flagship', flagshipName);
  } catch { /* ignore */ }
}

function getAiAggression() {
  try {
    return parseFloat(localStorage.getItem('plunder-ai-aggression') || '0.5');
  } catch { return 0.5; }
}

function setAiAggression(val) {
  try {
    localStorage.setItem('plunder-ai-aggression', String(val));
  } catch { /* ignore */ }
}

export const FLAG_COLORS = {
  blue:   '#4488ff',
  red:    '#ff4444',
  green:  '#44cc44',
  gold:   '#ffaa00',
  purple: '#aa44ff',
  teal:   '#44cccc',
};

const CUSTOM_DEFAULTS = getCustomization();

/**
 * Create the initial game state.
 * @param {'skirmish'|'waveDefense'} mode
 */
function createInitialGameState(mode = 'skirmish') {
  setMap(42, GRID_WIDTH, GRID_HEIGHT);

  if (mode === 'waveDefense') {
    // Wave Defense: player ships on left, no initial AI, no treasures
    const leftTiles = findOceanTilesInColumns(0, 3);
    const playerPos = pickPositions(leftTiles, 3);
    const flagshipName = CUSTOM_DEFAULTS.flagshipName || 'Sea Serpent';
    const units = [
      createUnit('galleon',    'player', playerPos[0].q, playerPos[0].r, flagshipName),
      createUnit('brigantine', 'player', playerPos[1].q, playerPos[1].r),
      createUnit('sloop',      'player', playerPos[2].q, playerPos[2].r),
    ];

    const highScore = getHighScore();
    return {
      gameMode: 'waveDefense',
      currentTurn: 1,
      wave: 1,
      highScore,
      captainName: CUSTOM_DEFAULTS.captainName,
      flagColor: CUSTOM_DEFAULTS.flagColor,
      flagshipName,
      gamePhase: 'playerTurn',
      units,
      selectedUnitId: null,
      winner: null,
      lastAttack: null,
      treasures: [],
      playerTreasures: 0,
      aiTreasures: 0,
      upgradeBonuses: { hp: 0, movement: 0, attack: 0 },
      lastUpgradeTurn: 0,
      exploredHexes: [],
      aiAggression: getAiAggression(), // 0-1 slider for AI behaviour
    };

  }

  // Skirmish mode (original behaviour)
  const units = createInitialUnits(CUSTOM_DEFAULTS.flagshipName || 'Sea Serpent');
  const unitPositions = units.map(u => ({ q: u.q, r: u.r }));
  const treasures = generateTreasures(unitPositions);

  return {
    gameMode: 'skirmish',
    currentTurn: 1,
    wave: 1,
    highScore: 0,
    captainName: CUSTOM_DEFAULTS.captainName,
    flagColor: CUSTOM_DEFAULTS.flagColor,
    flagshipName: CUSTOM_DEFAULTS.flagshipName || 'Sea Serpent',
    gamePhase: 'playerTurn', // 'playerTurn' | 'aiTurn' | 'upgradePhase' | 'gameOver'
    units,
    selectedUnitId: null,
    winner: null, // 'player' | 'ai' | null
    lastAttack: null, // { q, r, timestamp } — for explosion effect
    treasures,         // active treasures on the map
    playerTreasures: 0, // treasures collected by player
    aiTreasures: 0,     // treasures collected by AI
    upgradeBonuses: { hp: 0, movement: 0, attack: 0 },
    lastUpgradeTurn: 0,
    exploredHexes: [],
    aiAggression: getAiAggression(),
    };
}

/**
 * Read high score from localStorage.
 */
function getHighScore() {
  try {
    return parseInt(localStorage.getItem('plunder-peril-highscore') || '0', 10);
  } catch { return 0; }
}

/**
 * Save high score to localStorage.
 */
function setHighScore(score) {
  try {
    const current = getHighScore();
    if (score > current) {
      localStorage.setItem('plunder-peril-highscore', String(score));
    }
  } catch { /* ignore */ }
}

/**
 * Generate units for a wave in waveDefense mode.
 * Ships spawn on the right side (columns 7-9) on navigable tiles.
 */
function spawnWaveUnits(wave, currentUnits) {
  const occupiedSet = new Set();
  currentUnits.forEach(u => {
    if (u.hp > 0) occupiedSet.add(`${u.q},${u.r}`);
  });

  // Find spawn positions on the right side
  const tiles = [];
  for (let q = 7; q <= 9; q++) {
    for (let r = 0; r < 10; r++) {
      const terrain = getTileTerrain(q, r);
      if ((terrain === TERRAIN.OCEAN || terrain === TERRAIN.SHALLOW) &&
          !occupiedSet.has(`${q},${r}`)) {
        tiles.push({ q, r });
      }
    }
  }

  // Shuffle
  shuffle(tiles);

  // Determine count & composition
  const count = Math.min(2 + Math.floor(wave * 0.6), 8);

  // Composition grows with waves
  const types = getWaveTypes(wave);

  const units = [];
  const spawnCount = Math.min(count, tiles.length);
  for (let i = 0; i < spawnCount; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    units.push(createUnit(type, 'ai', tiles[i].q, tiles[i].r));
  }

  return units;
}

export function useGameState({ gameMode = 'skirmish' } = {}) {
  const [gameState, setGameState] = useState(() => createInitialGameState(gameMode));

  // Ref for reading current state inside callbacks without re-renders
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  });

  const { units, selectedUnitId, currentTurn, gamePhase, winner, lastAttack, treasures, playerTreasures, aiTreasures, upgradeBonuses, wave, highScore } = gameState;

  // Derived: the currently selected unit object
  const selectedUnit = useMemo(
    () => units.find(u => u.id === selectedUnitId) || null,
    [units, selectedUnitId]
  );

  // Derived: valid moves for the selected unit
  const validMoves = useMemo(() => {
    if (!selectedUnit || gamePhase !== 'playerTurn') return [];
    return bfsValidMoves(selectedUnit, units);
  }, [selectedUnit, units, gamePhase]);

  // Derived: valid attack targets for the selected unit
  const validTargets = useMemo(() => {
    if (!selectedUnit || gamePhase !== 'playerTurn') return [];
    return getValidTargets(selectedUnit, units);
  }, [selectedUnit, units, gamePhase]);

  // Derived: all valid move hexes as a Set for fast lookup
  const validMoveSet = useMemo(() => {
    const s = new Set();
    validMoves.forEach(m => s.add(`${m.q},${m.r}`));
    return s;
  }, [validMoves]);

  // Derived: valid target hexes as a Set
  const validTargetSet = useMemo(() => {
    const s = new Set();
    validTargets.forEach(t => s.add(`${t.q},${t.r}`));
    return s;
  }, [validTargets]);

  const playerUnits = useMemo(
    () => units.filter(u => u.owner === 'player' && u.hp > 0),
    [units]
  );
  const aiUnits = useMemo(
    () => units.filter(u => u.owner === 'ai' && u.hp > 0),
    [units]
  );

  // ── Fog of War: compute currently visible hexes from player units ──
  const visibleHexes = useMemo(() => {
    return computeVisibleHexes(playerUnits, 2);
  }, [playerUnits]);

  /**
   * Refresh movement points for all units of a given owner at turn start.
   */
  const refreshTurn = useCallback((owner) => {
    setGameState(prev => ({
      ...prev,
      units: prev.units.map(u => {
        if (u.owner === owner && u.hp > 0) {
          return {
            ...u,
            movementPoints: u.maxMovement,
            attacked: false,
            abilityCooldownTurns: Math.max(0, (u.abilityCooldownTurns || 0) - 1),
            abilityReady: (u.abilityCooldownTurns || 0) <= 1, // ready if 0 or about to become 0
          };
        }
        return u;
      }),
    }));
  }, []);

  // Refresh player units at the start of every player turn.
  // Covers initial mount, applyUpgrade, and the playerTurn transitions inside executeAiTurn.
  useEffect(() => {
    if (gamePhase === 'playerTurn') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: refresh stored turn-state when the phase flips to playerTurn (not derivable during render)
      refreshTurn('player');
    }
  }, [gamePhase, refreshTurn]);

  /**
   * Select a unit by ID. Only player units can be selected during playerTurn.
   */
  const selectUnit = useCallback((unitId) => {
    setGameState(prev => {
      if (prev.gamePhase !== 'playerTurn') return prev;
      const unit = prev.units.find(u => u.id === unitId);
      if (!unit || unit.owner !== 'player' || unit.hp <= 0) return prev;
      // If the unit has no movement left and has already attacked, cannot select
      if (unit.movementPoints <= 0 && unit.attacked) return prev;
      // Toggle selection if clicking the same unit
      if (prev.selectedUnitId === unitId) return { ...prev, selectedUnitId: null };
      return { ...prev, selectedUnitId: unitId };
    });
  }, []);

  /**
   * Deselect the currently selected unit.
   */
  const deselectUnit = useCallback(() => {
    setGameState(prev => ({ ...prev, selectedUnitId: null }));
  }, []);

  /**
   * Validate and compute BFS path for moving the selected unit to (targetQ, targetR).
   * Returns { path: [{q,r}...], unitId, cost } or null if invalid.
   * Does NOT update game state — call finalizeMove after animation completes.
   */
  const moveUnit = useCallback((targetQ, targetR) => {
    const prev = gameStateRef.current;
    if (prev.gamePhase !== 'playerTurn' || !prev.selectedUnitId) return null;
    const unit = prev.units.find(u => u.id === prev.selectedUnitId);
    if (!unit || unit.movementPoints <= 0 || unit.hp <= 0) return null;

    const moves = bfsValidMoves(unit, prev.units);
    const canMove = moves.some(m => m.q === targetQ && m.r === targetR);
    if (!canMove) return null;

    // Build occupied set (excluding the moving unit itself)
    const occupied = occupiedHexSet(prev.units, unit.id);

    // Compute BFS path
    const path = bfsPathTo(
      unit.q, unit.r, targetQ, targetR,
      unit.movementPoints, occupied, GRID_WIDTH, GRID_HEIGHT
    );
    if (!path || path.length < 2) return null;

    // Calculate total cost along the path
    let totalCost = 0;
    for (let i = 1; i < path.length; i++) {
      const terrain = getTileTerrain(path[i].q, path[i].r);
      totalCost += getMovementCost(terrain);
    }

    return { path, unitId: unit.id, cost: totalCost };
  }, []);

  /**
   * Apply the final position update after movement animation completes.
   * Moves unit to (targetQ, targetR), deducts movement points, and collects any treasure.
   */
  const finalizeMove = useCallback((unitId, targetQ, targetR, cost) => {
    setGameState(prev => {
      const unit = prev.units.find(u => u.id === unitId);
      const owner = unit ? unit.owner : null;

      // Check for treasure collection at destination
      const treasureHere = prev.treasures.find(t => t.q === targetQ && t.r === targetR);
      let newTreasures = prev.treasures;
      let newPlayerTreasures = prev.playerTreasures;
      let newAiTreasures = prev.aiTreasures;
      let newGamePhase = prev.gamePhase;
      let newWinner = prev.winner;

      if (treasureHere && owner) {
        newTreasures = prev.treasures.filter(t => t.id !== treasureHere.id);
        if (owner === 'player') {
          newPlayerTreasures = prev.playerTreasures + 1;
        } else {
          newAiTreasures = prev.aiTreasures + 1;
        }

        // Treasure victory: collecting all treasures wins immediately
        if (newTreasures.length === 0) {
          newGamePhase = 'gameOver';
          newWinner = newPlayerTreasures > newAiTreasures ? 'player' : 'ai';
        }
      }

      return {
        ...prev,
        selectedUnitId: null,
        treasures: newTreasures,
        playerTreasures: newPlayerTreasures,
        aiTreasures: newAiTreasures,
        gamePhase: newGamePhase,
        winner: newWinner,
        units: prev.units.map(u => {
          if (u.id === unitId) {
            return {
              ...u,
              q: targetQ,
              r: targetR,
              movementPoints: u.movementPoints - cost,
            };
          }
          return u;
        }),
      };
    });
  }, []);

  /**
   * Attack an enemy unit with the selected unit.
   */
  const attackUnit = useCallback((targetUnitId) => {
    setGameState(prev => {
      if (prev.gamePhase !== 'playerTurn' || !prev.selectedUnitId) return prev;
      const unit = prev.units.find(u => u.id === prev.selectedUnitId);
      if (!unit || unit.attacked || unit.hp <= 0) return prev;

      const target = prev.units.find(u => u.id === targetUnitId);
      if (!target || target.owner === unit.owner || target.hp <= 0) return prev;

      // Check range
      const dist = hexDistance(unit.q, unit.r, target.q, target.r);
      if (dist > unit.range) return prev;

      // Apply damage with terrain defense reduction
      const targetTerrain = getTileTerrain(target.q, target.r);
      const defense = getTerrainDefense(targetTerrain);
      // Check for Focus Fire bonus damage
      const dmgMultiplier = unit.focusFireReady ? 1.5 : 1.0;
      const effectiveDmg = Math.max(1, Math.round(unit.attack * dmgMultiplier) - defense);
      const newHp = target.hp - effectiveDmg;
      const targetDestroyed = newHp <= 0;

      // Check win condition
      let newGamePhase = prev.gamePhase;
      let winner = prev.winner;
      if (targetDestroyed) {
        const remainingEnemies = prev.units.filter(
          u => u.owner === target.owner && u.id !== target.id && u.hp > 0
        );
        if (remainingEnemies.length === 0) {
          newGamePhase = 'gameOver';
          winner = unit.owner;
        }
      }

      return {
        ...prev,
        selectedUnitId: null,
        gamePhase: newGamePhase,
        winner,
        lastAttack: { q: target.q, r: target.r, aq: unit.q, ar: unit.r, damage: effectiveDmg, timestamp: Date.now() },
        units: prev.units.map(u => {
          if (u.id === unit.id) {
            return {
              ...u,
              movementPoints: 0,
              attacked: true,
              focusFireReady: false, // consume the buff
            };
          }
          if (u.id === target.id) {
            // Reduce damage if target is shielded
            const shieldReduction = target.shieldedUntilTurn >= prev.currentTurn ? 2 : 0;
            const finalHp = target.hp - Math.max(1, effectiveDmg - shieldReduction);
            return {
              ...u,
              hp: Math.max(0, finalHp),
            };
          }
          return u;
        }),
      };
    });
  }, []);

  /**
   * End the current player's turn and trigger AI turn.
   */
  const endTurn = useCallback(() => {
    setGameState(prev => {
      if (prev.gamePhase !== 'playerTurn') return prev;
      return {
        ...prev,
        selectedUnitId: null,
        gamePhase: 'aiTurn',
      };
    });
  }, []);

  /**
   * Execute the AI turn: simple greedy attack-move behavior.
   */
  const executeAiTurn = useCallback(() => {
    setGameState(prev => {
      if (prev.gamePhase !== 'aiTurn') return prev;

      let updatedUnits = prev.units.map(u => {
        if (u.owner === 'ai' && u.hp > 0) {
          return { ...u, movementPoints: u.maxMovement, attacked: false };
        }
        return u;
      });

      let aiLastAttack = null;

      let currentTreasures = [...prev.treasures];
      let currentAiTreasures = prev.aiTreasures;
      let currentPlayerTreasures = prev.playerTreasures;

      // AI logic: for each AI unit, try to move toward and attack the nearest player unit
      const aiUnitIds = updatedUnits
        .filter(u => u.owner === 'ai' && u.hp > 0)
        .map(u => u.id);

      for (const aiId of aiUnitIds) {
        const aiUnit = updatedUnits.find(u => u.id === aiId);
        if (!aiUnit || aiUnit.hp <= 0) continue;

        const playerTargets = updatedUnits.filter(
          u => u.owner === 'player' && u.hp > 0
        );
        if (playerTargets.length === 0) {
          return {
            ...prev,
            units: updatedUnits,
            gamePhase: 'gameOver',
            winner: 'ai',
            lastAttack: aiLastAttack,
            treasures: currentTreasures,
            playerTreasures: currentPlayerTreasures,
            aiTreasures: currentAiTreasures,
          };
        }

        // Find nearest player unit
        let nearest = null;
        let nearestDist = Infinity;
        for (const pt of playerTargets) {
          const dist = hexDistance(aiUnit.q, aiUnit.r, pt.q, pt.r);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = pt;
          }
        }

        // If in attack range, decide based on aggression
        if (nearest && nearestDist <= aiUnit.range) {
          // AI aggression affects attack decision
          // Low aggression: only attack if clear advantage (damage ratio favorable)
          // High aggression: always attack if possible
          const agg = prev.aiAggression || 0.5;
          const damageRatio = nearest.hp > 0 ? aiUnit.attack / nearest.hp : 2;
          const attackThreshold = 1.0 - agg; // 0.7 at low agg, 0.0 at high agg
          const shouldAttack = damageRatio >= attackThreshold || agg > 0.7 || aiUnit.attack >= nearest.hp;

          if (!shouldAttack) {
            // Skip attack, try to move instead
            const moves = bfsValidMoves(aiUnit, updatedUnits);
            if (moves.length > 0) {
              // Move away from danger if low aggression
              let bestMove = null;
              if (agg < 0.4) {
                // Flee: move away from nearest player
                let bestDist = 0;
                for (const m of moves) {
                  const dist2 = hexDistance(m.q, m.r, nearest.q, nearest.r);
                  if (dist2 > bestDist) { bestDist = dist2; bestMove = m; }
                }
              } else {
                // Move toward (normal behavior)
                let bestDist = nearestDist;
                for (const m of moves) {
                  const dist2 = hexDistance(m.q, m.r, nearest.q, nearest.r);
                  if (dist2 < bestDist) { bestDist = dist2; bestMove = m; }
                }
              }
              if (bestMove) {
                const terrain = getTileTerrain(bestMove.q, bestMove.r);
                const cost = getMovementCost(terrain);
                updatedUnits = updatedUnits.map(u => {
                  if (u.id === aiId) {
                    return { ...u, q: bestMove.q, r: bestMove.r, movementPoints: Math.max(0, u.movementPoints - cost) };
                  }
                  return u;
                });
              }
            }
            continue;
          }

          // Apply terrain defense
          const targetTerrain = getTileTerrain(nearest.q, nearest.r);
          const defense = getTerrainDefense(targetTerrain);
          const effectiveDmg = Math.max(1, aiUnit.attack - defense);
          const newHp = nearest.hp - effectiveDmg;
          const destroyed = newHp <= 0;
          aiLastAttack = { q: nearest.q, r: nearest.r, aq: aiUnit.q, ar: aiUnit.r, damage: effectiveDmg, timestamp: Date.now() };
          updatedUnits = updatedUnits.map(u => {
            if (u.id === aiId) {
              return { ...u, movementPoints: 0, attacked: true };
            }
            if (u.id === nearest.id) {
              return { ...u, hp: Math.max(0, newHp) };
            }
            return u;
          });

          if (destroyed) {
            const remainingPlayer = updatedUnits.filter(
              u => u.owner === 'player' && u.hp > 0 && u.id !== nearest.id
            );
            if (remainingPlayer.length === 0) {
              return {
                ...prev,
                units: updatedUnits,
                gamePhase: 'gameOver',
                winner: 'ai',
                selectedUnitId: null,
                lastAttack: aiLastAttack,
              };
            }
          }
          continue;
        }

        // Otherwise, move toward the nearest player unit
        const moves = bfsValidMoves(aiUnit, updatedUnits);
        if (moves.length > 0 && nearest) {
          // Pick the move that gets closest to the target
          let bestMove = null;
          let bestDist = nearestDist;
          for (const m of moves) {
            const dist2 = hexDistance(m.q, m.r, nearest.q, nearest.r);
            // Only consider moves that actually get us closer
            if (dist2 < bestDist) {
              bestDist = dist2;
              bestMove = m;
            }
          }

          if (bestMove) {
            const terrain = getTileTerrain(bestMove.q, bestMove.r);
            const cost = getMovementCost(terrain);
            updatedUnits = updatedUnits.map(u => {
              if (u.id === aiId) {
                return {
                  ...u,
                  q: bestMove.q,
                  r: bestMove.r,
                  movementPoints: Math.max(0, u.movementPoints - cost),
                };
              }
              return u;
            });

            // Check if AI unit collected a treasure at its new position
            const treasureAtDest = currentTreasures.find(
              t => t.q === bestMove.q && t.r === bestMove.r
            );
            if (treasureAtDest) {
              currentTreasures = currentTreasures.filter(t => t.id !== treasureAtDest.id);
              currentAiTreasures++;
            }
          }
        }
      }

      // Check if player is wiped out after AI moves
      const remainingPlayer = updatedUnits.filter(
        u => u.owner === 'player' && u.hp > 0
      );
      if (remainingPlayer.length === 0) {
        return {
          ...prev,
          units: updatedUnits,
          gamePhase: 'gameOver',
          winner: 'ai',
          selectedUnitId: null,
          lastAttack: aiLastAttack,
          treasures: currentTreasures,
          playerTreasures: currentPlayerTreasures,
          aiTreasures: currentAiTreasures,
        };
      }

      // Check treasure victory after AI turn (skirmish mode only)
      if (prev.gameMode !== 'waveDefense' && currentTreasures.length === 0) {
        return {
          ...prev,
          units: updatedUnits,
          gamePhase: 'gameOver',
          winner: currentPlayerTreasures > currentAiTreasures ? 'player' : 'ai',
          selectedUnitId: null,
          lastAttack: aiLastAttack,
          treasures: currentTreasures,
          playerTreasures: currentPlayerTreasures,
          aiTreasures: currentAiTreasures,
        };
      }

      // ── Wave Defense: check if all enemies are destroyed ──
      if (prev.gameMode === 'waveDefense') {
        const remainingAI = updatedUnits.filter(u => u.owner === 'ai' && u.hp > 0);
        if (remainingAI.length === 0) {
          // Wave cleared!
          const nextWave = prev.wave + 1;
          // Save high score (waves survived = nextWave - 1)
          const wavesSurvived = nextWave - 1;
          setHighScore(wavesSurvived);

          // Check for upgrade every 3 waves
          const needsUpgrade = wavesSurvived % 3 === 0 && wavesSurvived > 0;

          // Spawn next wave enemies
          const newEnemies = spawnWaveUnits(nextWave, updatedUnits);
          const allUnits = [...updatedUnits, ...newEnemies];

          return {
            ...prev,
            units: allUnits,
            selectedUnitId: null,
            currentTurn: prev.currentTurn + 1,
            wave: nextWave,
            highScore: Math.max(prev.highScore, wavesSurvived),
            gamePhase: needsUpgrade ? 'upgradePhase' : 'playerTurn',
            lastAttack: aiLastAttack,
          };
        }
      }

      // Switch back to player turn (or upgrade phase every 3 turns, skirmish only)
      const nextTurn = prev.currentTurn + 1;
      const needsUpgrade = prev.gameMode !== 'waveDefense' && nextTurn % 3 === 0 && nextTurn > 0;
      return {
        ...prev,
        units: updatedUnits,
        selectedUnitId: null,
        currentTurn: nextTurn,
        gamePhase: needsUpgrade ? 'upgradePhase' : 'playerTurn',
        lastAttack: aiLastAttack,
        treasures: currentTreasures,
        playerTreasures: currentPlayerTreasures,
        aiTreasures: currentAiTreasures,
      };
    });
  }, []);

  /**
   * Apply a ship upgrade to all player units.
   * Called during upgradePhase (every 3 turns).
   * @param {'hp'|'movement'|'attack'} type
   */
  const applyUpgrade = useCallback((type) => {
    setGameState(prev => {
      if (prev.gamePhase !== 'upgradePhase') return prev;

      const bonus = { ...prev.upgradeBonuses, [type]: (prev.upgradeBonuses[type] || 0) + 1 };

      const upgradedUnits = prev.units.map(u => {
        if (u.owner !== 'player') return u;
        const nu = { ...u };
        if (type === 'hp') {
          nu.maxHp += 1;
          nu.hp = Math.min(nu.hp + 1, nu.maxHp);
        }
        if (type === 'movement') {
          nu.maxMovement += 1;
          nu.movementPoints = Math.min(nu.movementPoints + 1, nu.maxMovement);
        }
        if (type === 'attack') {
          nu.attack += 1;
        }
        return nu;
      });

      return {
        ...prev,
        units: upgradedUnits,
        upgradeBonuses: bonus,
        lastUpgradeTurn: prev.currentTurn,
        gamePhase: 'playerTurn',
      };
    });
  }, []);

  return {
    // State
    units,
    selectedUnit,
    selectedUnitId,
    currentTurn,
    gamePhase,
    winner,
    validMoves,
    validTargets,
    validMoveSet,
    validTargetSet,
    playerUnits,
    aiUnits,
    lastAttack,
    treasures,
    playerTreasures,
    aiTreasures,
    upgradeBonuses,
    gameMode,
    wave,
    highScore,
    captainName: gameState.captainName,
    flagColor: gameState.flagColor,
    flagshipName: gameState.flagshipName,
    visibleHexes,        // Fog of War: Set of "q,r" hexes currently visible
    exploredHexes: gameState.exploredHexes,
    aiAggression: gameState.aiAggression,

    // Actions
    selectUnit,
    deselectUnit,
    moveUnit,
    finalizeMove,
    attackUnit,
    endTurn,
    executeAiTurn,
    refreshTurn,
    applyUpgrade,
    activateAbility: () => {
      setGameState(prev => {
        if (prev.gamePhase !== 'playerTurn' || !prev.selectedUnitId) return prev;
        const unit = prev.units.find(u => u.id === prev.selectedUnitId);
        if (!unit || !unit.abilityReady || unit.hp <= 0) return prev;
        const def = UNIT_TYPES[unit.type];
        if (!def.ability) return prev;
        let updatedUnits = prev.units.map(u => ({ ...u }));
        switch (def.ability) {
          case 'recon': {
            const visible = new Set(), visited = new Set();
            const queue = [{ q: unit.q, r: unit.r, dist: 0 }];
            visited.add(`${unit.q},${unit.r}`);
            while (queue.length > 0) { const cur = queue.shift(); visible.add(`${cur.q},${cur.r}`); if (cur.dist >= 3) continue;
              for (const n of getHexNeighbors(cur.q, cur.r)) { const nk = `${n.q},${n.r}`; if (visited.has(nk) || !isWithinBounds(n.q,n.r,GRID_WIDTH,GRID_HEIGHT)) continue; visited.add(nk); queue.push({q:n.q,r:n.r,dist:cur.dist+1}); } }
            const unexplored = [...visible].filter(h => !prev.exploredHexes.includes(h));
            shuffle(unexplored);
            return { ...prev, exploredHexes: [...prev.exploredHexes, ...unexplored.slice(0,3)],
              units: updatedUnits.map(u => u.id===unit.id ? {...u,abilityReady:false,abilityCooldownTurns:def.abilityCooldown,movementPoints:0,attacked:true} : u) };
          }
          case 'focusFire':
            return { ...prev, units: updatedUnits.map(u => u.id===unit.id ? {...u,abilityReady:false,abilityCooldownTurns:def.abilityCooldown,focusFireReady:true,movementPoints:0,attacked:true} : u) };
          case 'shield': {
            const ct = prev.currentTurn;
            for (const n of getHexNeighbors(unit.q,unit.r))
              updatedUnits = updatedUnits.map(u => u.owner==='player'&&u.q===n.q&&u.r===n.r&&u.hp>0&&u.id!==unit.id ? {...u,shieldedUntilTurn:ct+1} : u);
            return { ...prev, units: updatedUnits.map(u => u.id===unit.id ? {...u,abilityReady:false,abilityCooldownTurns:def.abilityCooldown,movementPoints:0,attacked:true} : u) };
          }
          default: return prev;
        }
      });
    },
    setCaptainName: (name) => {
      saveCustomization(name, gameStateRef.current.flagColor, gameStateRef.current.flagshipName);
      setGameState(prev => ({ ...prev, captainName: name }));
    },
    setFlagColor: (color) => {
      saveCustomization(gameStateRef.current.captainName, color, gameStateRef.current.flagshipName);
      setGameState(prev => ({ ...prev, flagColor: color }));
    },
    setFlagshipName: (name) => {
      saveCustomization(gameStateRef.current.captainName, gameStateRef.current.flagColor, name);
      setGameState(prev => ({ ...prev, flagshipName: name }));
    },
    setAiAggression: (val) => {
      setAiAggression(val);
      setGameState(prev => ({ ...prev, aiAggression: val }));
    },
  };
}

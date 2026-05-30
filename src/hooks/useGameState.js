import { useState, useCallback, useMemo } from 'react';
import {
  getTileTerrain,
  getHexNeighbors,
  isWithinBounds,
  isCoastalTile,
  getMovementCost,
} from './useHexGrid.js';

const GRID_WIDTH = 10;
const GRID_HEIGHT = 10;

/**
 * Unit type definitions: stats for each ship class.
 */
export const UNIT_TYPES = {
  sloop:      { maxHp: 4, maxMovement: 3, attack: 1, range: 1, label: 'Sloop' },
  brigantine: { maxHp: 6, maxMovement: 2, attack: 2, range: 1, label: 'Brigantine' },
  galleon:    { maxHp: 8, maxMovement: 1, attack: 3, range: 1, label: 'Galleon' },
};

let nextUnitId = 1;

function createUnit(type, owner, q, r) {
  const def = UNIT_TYPES[type];
  return {
    id: `unit-${nextUnitId++}`,
    type,
    owner,
    q,
    r,
    hp: def.maxHp,
    maxHp: def.maxHp,
    movementPoints: def.maxMovement,
    maxMovement: def.maxMovement,
    attack: def.attack,
    range: def.range,
    attacked: false,
  };
}

/**
 * Find all ocean tiles within a given column range.
 */
function findOceanTilesInColumns(minQ, maxQ) {
  const tiles = [];
  for (let q = minQ; q <= maxQ; q++) {
    for (let r = 0; r < GRID_HEIGHT; r++) {
      if (getTileTerrain(q, r) === 'ocean') {
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
function createInitialUnits() {
  // Find ocean tiles on left (q 0-3) and right (q 6-9) sides
  const leftTiles = findOceanTilesInColumns(0, 3);
  const rightTiles = findOceanTilesInColumns(6, 9);

  // Spread units out across available ocean tiles
  function getPositions(tiles, count) {
    // Take evenly-spaced tiles from the available pool
    if (tiles.length >= count) {
      const step = (tiles.length - 1) / Math.max(count - 1, 1);
      const selected = [];
      for (let i = 0; i < count; i++) {
        selected.push(tiles[Math.round(i * step)]);
      }
      return selected;
    }
    // Fallback: if not enough ocean tiles, use first available
    return tiles.slice(0, count);
  }

  const playerPositions = getPositions(leftTiles, 3);
  const aiPositions = getPositions(rightTiles, 3);

  return [
    // Player units
    createUnit('galleon',    'player', playerPositions[0].q, playerPositions[0].r),
    createUnit('brigantine', 'player', playerPositions[1].q, playerPositions[1].r),
    createUnit('sloop',      'player', playerPositions[2].q, playerPositions[2].r),
    // AI units
    createUnit('galleon',    'ai',     aiPositions[0].q, aiPositions[0].r),
    createUnit('brigantine', 'ai',     aiPositions[1].q, aiPositions[1].r),
    createUnit('sloop',      'ai',     aiPositions[2].q, aiPositions[2].r),
  ];
}

/**
 * Run BFS to find all hexes reachable by a unit given its remaining movement points,
 * terrain costs, and occupancy.
 */
function bfsValidMoves(unit, allUnits) {
  const occupied = new Set();
  allUnits.forEach(u => {
    if (u.id !== unit.id && u.hp > 0) {
      occupied.add(`${u.q},${u.r}`);
    }
  });

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

      // Only ocean and coastal land tiles are navigable
      const terrain = getTileTerrain(n.q, n.r);
      const navigable =
        terrain === 'ocean' ||
        (terrain === 'land' && isCoastalTile(n.q, n.r, GRID_WIDTH, GRID_HEIGHT));
      if (!navigable) continue;

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
    const dq = Math.abs(u.q - unit.q);
    const dr = Math.abs(u.r - unit.r);
    const ds = Math.abs((-u.q - u.r) - (-unit.q - unit.r));
    const dist = Math.max(dq, dr, ds);
    return dist <= unit.range;
  });
}

/**
 * Create the initial game state.
 */
function createInitialGameState() {
  return {
    currentTurn: 1,
    gamePhase: 'playerTurn', // 'playerTurn' | 'aiTurn' | 'gameOver'
    units: createInitialUnits(),
    selectedUnitId: null,
    winner: null, // 'player' | 'ai' | null
    lastAttack: null, // { q, r, timestamp } — for explosion effect
  };
}

/**
 * Custom hook for managing all game state.
 */
export function useGameState() {
  const [gameState, setGameState] = useState(createInitialGameState);

  const { units, selectedUnitId, currentTurn, gamePhase, winner, lastAttack } = gameState;

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
          };
        }
        return u;
      }),
    }));
  }, []);

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
   * Move the selected unit to a target hex, if valid.
   */
  const moveUnit = useCallback((targetQ, targetR) => {
    setGameState(prev => {
      if (prev.gamePhase !== 'playerTurn' || !prev.selectedUnitId) return prev;
      const unit = prev.units.find(u => u.id === prev.selectedUnitId);
      if (!unit || unit.movementPoints <= 0 || unit.hp <= 0) return prev;

      const moves = bfsValidMoves(unit, prev.units);
      const canMove = moves.some(m => m.q === targetQ && m.r === targetR);
      if (!canMove) return prev;

      // Calculate the cost of the actual path taken (BFS shortest path)
      const terrain = getTileTerrain(targetQ, targetR);
      const cost = getMovementCost(terrain);

      return {
        ...prev,
        units: prev.units.map(u => {
          if (u.id === unit.id) {
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
      const dq = Math.abs(target.q - unit.q);
      const dr = Math.abs(target.r - unit.r);
      const ds = Math.abs((-target.q - target.r) - (-unit.q - unit.r));
      const dist = Math.max(dq, dr, ds);
      if (dist > unit.range) return prev;

      // Apply damage
      const newHp = target.hp - unit.attack;
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
        lastAttack: { q: target.q, r: target.r, timestamp: Date.now() },
        units: prev.units.map(u => {
          if (u.id === unit.id) {
            return {
              ...u,
              movementPoints: 0,
              attacked: true,
            };
          }
          if (u.id === target.id) {
            return {
              ...u,
              hp: Math.max(0, newHp),
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
          };
        }

        // Find nearest player unit
        let nearest = null;
        let nearestDist = Infinity;
        for (const pt of playerTargets) {
          const dq = Math.abs(pt.q - aiUnit.q);
          const dr = Math.abs(pt.r - aiUnit.r);
          const ds = Math.abs((-pt.q - pt.r) - (-aiUnit.q - aiUnit.r));
          const dist = Math.max(dq, dr, ds);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = pt;
          }
        }

        // If in attack range, attack
        if (nearest && nearestDist <= aiUnit.range) {
          const newHp = nearest.hp - aiUnit.attack;
          const destroyed = newHp <= 0;
          aiLastAttack = { q: nearest.q, r: nearest.r, timestamp: Date.now() };
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
            const dq2 = Math.abs(nearest.q - m.q);
            const dr2 = Math.abs(nearest.r - m.r);
            const ds2 = Math.abs((-nearest.q - nearest.r) - (-m.q - m.r));
            const dist2 = Math.max(dq2, dr2, ds2);
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
        };
      }

      // Switch back to player turn
      return {
        ...prev,
        units: updatedUnits,
        selectedUnitId: null,
        currentTurn: prev.currentTurn + 1,
        gamePhase: 'playerTurn',
        lastAttack: aiLastAttack,
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

    // Actions
    selectUnit,
    deselectUnit,
    moveUnit,
    attackUnit,
    endTurn,
    executeAiTurn,
    refreshTurn,
  };
}

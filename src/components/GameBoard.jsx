import { useEffect, useRef, useCallback, useState } from 'react';
import {
  HEX_RADIUS,
  hexToPixel,
  pixelToHex,
  hexRound,
  hexCorner,
  getTileTerrain,
  getTerrainColor,
  getTerrainSymbol,
  TERRAIN,
} from '../hooks/useHexGrid.js';
import { useGameState, UNIT_TYPES, FLAG_COLORS } from '../hooks/useGameState.js';
import {
  updateParticles,
  drawParticles,
  spawnWaterWake,
  spawnCannonImpact,
  spawnShipExplosion,
  spawnWaterRipple,
  spawnCannonMuzzleFlash,
} from '../effects/ParticleEngine.js';
import { playCannonFire, playExplosion, playMove, playAbility } from '../effects/AudioEngine.js';

// ── Asset imports (Vite returns URL strings, so we wrap in Image()) ──
import sloopUrl from '../assets/sloop.jpg';
import brigantineUrl from '../assets/brigantine2.jpg';
import galleonUrl from '../assets/galleon.jpg';
import heartUrl from '../assets/heart.jpg';
import bootUrl from '../assets/boot.jpg';
import crosscannonUrl from '../assets/crosscannon.jpg';
import explosionUrl from '../assets/explosion.jpg';
import treasurechestUrl from '../assets/treasurechest.jpg';
import portIconUrl from '../assets/port_icon.png';
import reefUrl from '../assets/reef.png';
import pennantPlayerUrl from '../assets/pennant_player.png';
import pennantAiUrl from '../assets/pennant_ai.png';
import woodButtonUrl from '../assets/wood_button.png';

// Convert Vite URL strings to HTMLImageElements for ctx.drawImage()
function makeImg(url) { const i = new Image(); i.src = url; return i; }
const sloopImg = makeImg(sloopUrl);
const brigantineImg = makeImg(brigantineUrl);
const galleonImg = makeImg(galleonUrl);
const heartImg = makeImg(heartUrl);
const bootImg = makeImg(bootUrl);
const crosscannonImg = makeImg(crosscannonUrl);
const explosionImg = makeImg(explosionUrl);
const treasurechestImg = makeImg(treasurechestUrl);
const portIconImg = makeImg(portIconUrl);
const reefImg = makeImg(reefUrl);
const pennantPlayerImg = makeImg(pennantPlayerUrl);
const pennantAiImg = makeImg(pennantAiUrl);
const woodButtonImg = makeImg(woodButtonUrl);

const GRID_WIDTH = 10;
const GRID_HEIGHT = 10;

/** Map unit type → sprite image */
const SHIP_SPRITES = {
  sloop: sloopImg,
  brigantine: brigantineImg,
  galleon: galleonImg,
};

/** Map unit type → draw size factor (relative to HEX_RADIUS) */
const SHIP_SIZE = {
  sloop: 0.7,
  brigantine: 0.75,
  galleon: 0.85,
};

export default function GameBoard({ gameMode: initialMode = 'skirmish' }) {
  const canvasRef = useRef(null);
  const particleCanvasRef = useRef(null);
  const [hoveredHex, setHoveredHex] = useState(null);
  const [hoveredUnit, setHoveredUnit] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const lastHoveredHexRef = useRef(null);
  const gridOffsetRef = useRef({ offsetX: 0, offsetY: 0 });
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const hoveredHexRef = useRef(null);
  const [explosionEffect, setExplosionEffect] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const prevLastAttackRef = useRef(null);
  const prevUnitPositionsRef = useRef(new Map());
  const prevAliveRef = useRef(new Set());
  const rafRef = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const rippleTimerRef = useRef(0);
  const exploredHexesRef = useRef(new Set());  // Fog of War: accumulated hexes ever seen
  const damageNumbersRef = useRef([]);  // Floating damage numbers: [{q,r,value,startTime,owner}]

  // ── Ship movement animation state ──
  const isAnimatingRef = useRef(false);
  const animationRef = useRef(null);

  // Keep a ref synced with current hoveredHex to avoid stale closures in event handlers
  hoveredHexRef.current = hoveredHex;

  // Game state hook
  const game = useGameState({ gameMode: initialMode });
  const gameStateRef = useRef(game);
  gameStateRef.current = game;

  // ── Particle effects: movement detection + attack/explosion ──
  useEffect(() => {
    const offset = gridOffsetRef.current;

    // Track ship movement → spawn water wake
    const currentPositions = new Map();
    for (const unit of game.units) {
      if (unit.hp <= 0) continue;
      const key = unit.id;
      currentPositions.set(key, { q: unit.q, r: unit.r });
      const prev = prevUnitPositionsRef.current.get(key);
      if (prev && (prev.q !== unit.q || prev.r !== unit.r)) {
        // Ship moved — spawn wake at old position
        const oldPixel = hexToPixel(prev.q, prev.r);
        spawnWaterWake(oldPixel.x + offset.offsetX, oldPixel.y + offset.offsetY);
        // Also spawn at midpoint for longer moves
        const newPixel = hexToPixel(unit.q, unit.r);
        const midX = (oldPixel.x + newPixel.x) / 2 + offset.offsetX;
        const midY = (oldPixel.y + newPixel.y) / 2 + offset.offsetY;
        spawnWaterWake(midX, midY);
      }
    }
    prevUnitPositionsRef.current = currentPositions;

    // Track destroyed ships → spawn explosion particles
    const currentAlive = new Set(game.units.filter(u => u.hp > 0).map(u => u.id));
    for (const id of prevAliveRef.current) {
      if (!currentAlive.has(id)) {
        playExplosion(); // Audio: explosion on ship destruction
        // This ship was destroyed — find its last position from current units array
        const deadUnit = game.units.find(u => u.id === id);
        if (deadUnit) {
          const pixel = hexToPixel(deadUnit.q, deadUnit.r);
          spawnShipExplosion(pixel.x + offset.offsetX, pixel.y + offset.offsetY);
        }
      }
    }
    prevAliveRef.current = currentAlive;
  }, [game.units]);

  // ── Explosion effect from lastAttack → spawn cannon impact particles ──
  useEffect(() => {
    if (game.lastAttack && game.lastAttack !== prevLastAttackRef.current) {
      prevLastAttackRef.current = game.lastAttack;
      playCannonFire(); // Audio: cannon sound on every attack
      const offset = gridOffsetRef.current;
      const pixel = hexToPixel(game.lastAttack.q, game.lastAttack.r);
      spawnCannonImpact(pixel.x + offset.offsetX, pixel.y + offset.offsetY);

      // Spawn muzzle flash at the attacker's hex (orange burst)
      if (game.lastAttack.aq !== undefined) {
        const attackerPixel = hexToPixel(game.lastAttack.aq, game.lastAttack.ar);
        spawnCannonMuzzleFlash(attackerPixel.x + offset.offsetX, attackerPixel.y + offset.offsetY);
      }

      setExplosionEffect({
        q: game.lastAttack.q,
        r: game.lastAttack.r,
        timestamp: game.lastAttack.timestamp,
      });
      const timer = setTimeout(() => setExplosionEffect(null), 500);
      return () => clearTimeout(timer);
    }
  }, [game.lastAttack]);

  // ── Floating damage numbers: spawn on attack ──
  useEffect(() => {
    if (game.lastAttack && game.lastAttack !== prevLastAttackRef.current) {
      // Use the effective damage from lastAttack (already accounts for terrain defense)
      const dmg = game.lastAttack.damage || 1;
      // Determine attacker owner from lastAttack position match
      const attackerAtPos = game.units.find(
        u => u.q === game.lastAttack.aq && u.r === game.lastAttack.ar
      );
      damageNumbersRef.current.push({
        q: game.lastAttack.q,
        r: game.lastAttack.r,
        value: dmg,
        startTime: performance.now(),
        owner: attackerAtPos ? attackerAtPos.owner : 'ai',
      });
      // Clean old entries
      const now = performance.now();
      damageNumbersRef.current = damageNumbersRef.current.filter(
        d => now - d.startTime < 1200
      );
    }
  }, [game.lastAttack, game.units]);

  // ────────────────────────────── DRAW FUNCTION ──────────────────────────────

  const draw = useCallback((ctx, width, height, hover, state, explosion, animatingUnitPos, fogHexes) => {
    // state = { units, selectedUnit, validMoveSet, validTargetSet } or null
    // animatingUnitPos = { unitId, cx, cy } | null — override position for animated unit
    // fogHexes = { visible: Set of "q,r", explored: Set of "q,r" } | null — Fog of War
    ctx.clearRect(0, 0, width, height);

    // Calculate the pixel offset to center the grid
    const centerHexX = (GRID_WIDTH - 1) / 2;
    const centerHexY = (GRID_HEIGHT - 1) / 2;
    const centerPixel = hexToPixel(centerHexX, centerHexY);

    const offsetX = width / 2 - centerPixel.x;
    const offsetY = height / 2 - centerPixel.y;

    // Store offset for event handlers and particle spawning
    gridOffsetRef.current = { offsetX, offsetY };

    // ── Helper: draw hex path ──
    const drawHexPath = (cx, cy) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const corner = hexCorner(cx, cy, HEX_RADIUS, i);
        if (i === 0) {
          ctx.moveTo(corner.x, corner.y);
        } else {
          ctx.lineTo(corner.x, corner.y);
        }
      }
      ctx.closePath();
    };

    // ── 1. Draw grid tiles — programmatic with texture ──
    for (let q = 0; q < GRID_WIDTH; q++) {
      for (let r = 0; r < GRID_HEIGHT; r++) {
        const { x, y } = hexToPixel(q, r);
        const cx = x + offsetX;
        const cy = y + offsetY;

        const terrain = getTileTerrain(q, r);

        // Draw hex fill
        drawHexPath(cx, cy);
        ctx.fillStyle = getTerrainColor(terrain);
        ctx.fill();

        // Add subtle noise texture for depth
        ctx.save();
        drawHexPath(cx, cy);
        ctx.clip();
        // Tiny dots for texture
        const seed = (q * 7 + r * 13) % 100;
        for (let i = 0; i < 6; i++) {
          const tx = cx + Math.sin((seed + i * 37) * 0.1) * HEX_RADIUS * 0.5;
          const ty = cy + Math.cos((seed + i * 53) * 0.1) * HEX_RADIUS * 0.5;
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.beginPath();
          ctx.arc(tx, ty, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Hex border
        drawHexPath(cx, cy);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ── Terrain images (port, reef) and deep-ocean pattern ──
        if (terrain === TERRAIN.PORT && portIconImg && portIconImg.complete && portIconImg.naturalWidth > 0) {
          const iconSize = HEX_RADIUS * 0.7;
          ctx.save();
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 12;
          ctx.drawImage(portIconImg, cx - iconSize, cy - iconSize, iconSize * 2, iconSize * 2);
          ctx.restore();
        } else if (terrain === TERRAIN.REEF && reefImg && reefImg.complete && reefImg.naturalWidth > 0) {
          const iconSize = HEX_RADIUS * 0.6;
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.drawImage(reefImg, cx - iconSize, cy - iconSize, iconSize * 2, iconSize * 2);
          ctx.restore();
        } else {
          // Fallback text symbol for other terrain types
          const symbol = getTerrainSymbol(terrain);
          if (symbol) {
            ctx.save();
            ctx.font = `${Math.round(HEX_RADIUS * 0.55)}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillText(symbol, cx, cy);
            ctx.restore();
          }
        }

        // Deep ocean subtle wave lines
        if (terrain === TERRAIN.DEEP_OCEAN) {
          ctx.save();
          const waveSeed = (q * 17 + r * 31) % 100;
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 2; i++) {
            const wy = cy - HEX_RADIUS * 0.3 + i * HEX_RADIUS * 0.4;
            ctx.beginPath();
            ctx.moveTo(cx - HEX_RADIUS * 0.6, wy);
            ctx.quadraticCurveTo(
              cx + Math.sin(waveSeed + i * 2) * HEX_RADIUS * 0.2,
              wy - HEX_RADIUS * 0.15,
              cx + HEX_RADIUS * 0.6,
              wy,
            );
            ctx.stroke();
          }
          ctx.restore();
        }

        // ── Highlights over tiles ──
        if (state) {
          if (state.validMoveSet && state.validMoveSet.has(`${q},${r}`)) {
            ctx.save();
            drawHexPath(cx, cy);
            ctx.fillStyle = 'rgba(0, 220, 160, 0.35)';
            ctx.fill();
            ctx.restore();
          }
          if (state.validTargetSet && state.validTargetSet.has(`${q},${r}`)) {
            ctx.save();
            drawHexPath(cx, cy);
            ctx.fillStyle = 'rgba(255, 60, 60, 0.45)';
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }

    // ── 2. Selected unit gold border ──
    if (state && state.selectedUnit) {
      const { x, y } = hexToPixel(state.selectedUnit.q, state.selectedUnit.r);
      const cx = x + offsetX;
      const cy = y + offsetY;

      drawHexPath(cx, cy);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }

    // ── 2b. Fog of War overlay ──
    if (fogHexes && fogHexes.visible) {
      for (let q = 0; q < GRID_WIDTH; q++) {
        for (let r = 0; r < GRID_HEIGHT; r++) {
          const hexKey = `${q},${r}`;
          if (fogHexes.visible.has(hexKey)) continue; // Skip visible hexes

          const { x, y } = hexToPixel(q, r);
          const cx = x + offsetX;
          const cy = y + offsetY;
          const explored = fogHexes.explored && fogHexes.explored.has(hexKey);

          drawHexPath(cx, cy);
          // Explored but not visible: lighter fog. Never explored: darker fog.
          ctx.fillStyle = explored
            ? 'rgba(5, 10, 20, 0.55)'
            : 'rgba(5, 10, 20, 0.85)';
          ctx.fill();
        }
      }
    }

    // ── 2c. Floating damage numbers ──
    const now = performance.now();
    const activeDmgNums = damageNumbersRef.current.filter(d => now - d.startTime < 800);
    damageNumbersRef.current = activeDmgNums; // cleanup in-place
    for (const dn of activeDmgNums) {
      const { x, y } = hexToPixel(dn.q, dn.r);
      const cx = x + offsetX;
      const cy = y + offsetY;
      const elapsed = (now - dn.startTime) / 1000; // seconds
      const progress = Math.min(elapsed / 0.6, 1); // 600ms animation
      const alpha = 1 - progress;
      const floatY = -20 * progress; // float upward 20px

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.round(HEX_RADIUS * 0.55)}px Georgia`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = dn.owner === 'ai' ? '#ff4444' : '#ffaa00'; // red for AI hits, orange for player hits
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(`-${dn.value}`, cx, cy + floatY);
      ctx.restore();
    }

    // ── 3. Draw units as sprite images (clipped to hex + chroma-key blue bg) ──
    if (state && state.units) {
      for (const unit of state.units) {
        if (unit.hp <= 0) continue;

        // Use animated position if this unit is currently animating
        let cx, cy;
        if (animatingUnitPos && animatingUnitPos.unitId === unit.id) {
          cx = animatingUnitPos.cx;
          cy = animatingUnitPos.cy;
        } else {
          const { x, y } = hexToPixel(unit.q, unit.r);
          cx = x + offsetX;
          cy = y + offsetY;
        }

        const spriteImg = SHIP_SPRITES[unit.type];
        const sizeFactor = SHIP_SIZE[unit.type] || 0.7;
        const spriteSize = HEX_RADIUS * sizeFactor;
        const isPlayer = unit.owner === 'player';

        if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
          // Draw ship on a temporary canvas to chroma-key the blue ocean bg
          const tmpCanvas = document.createElement('canvas');
          const tmpCtx = tmpCanvas.getContext('2d');
          const drawSize = Math.round(spriteSize * 2);
          tmpCanvas.width = drawSize;
          tmpCanvas.height = drawSize;

          // Draw the ship sprite on temp canvas
          tmpCtx.drawImage(spriteImg, 0, 0, drawSize, drawSize);

          // Chroma-key: remove pixels that are predominantly blue
          const imageData = tmpCtx.getImageData(0, 0, drawSize, drawSize);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // If pixel is more blue than red+green combined (with threshold)
            if (b > r * 1.2 && b > g * 1.2 && b > 100) {
              data[i + 3] = 0; // Set alpha to 0 (transparent)
            }
          }
          tmpCtx.putImageData(imageData, 0, 0);

          // Draw the cleaned ship on main canvas
          ctx.save();
          // Clip to hex shape
          drawHexPath(cx, cy);
          ctx.clip();

          // Glow for selected unit
          if (state.selectedUnit && state.selectedUnit.id === unit.id) {
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 10;
          }

          ctx.drawImage(tmpCanvas, cx - drawSize / 2, cy - drawSize / 2);
          ctx.restore();
        } else {
          // Fallback: colored circle if image not yet loaded
          ctx.save();
          drawHexPath(cx, cy);
          ctx.clip();
          ctx.fillStyle = isPlayer ? '#4488ff' : '#ff4444';
          ctx.beginPath();
          ctx.arc(cx, cy, spriteSize * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Owner indicator ring around the ship
        ctx.beginPath();
        ctx.arc(cx, cy, spriteSize * 0.9, 0, Math.PI * 2);
        ctx.strokeStyle = isPlayer ? 'rgba(68,136,255,0.5)' : 'rgba(255,68,68,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw HP bar below unit sprite
        const barWidth = HEX_RADIUS * 0.55;
        const barHeight = 4;
        const barX = cx - barWidth / 2;
        const barY = cy + spriteSize + 2;
        const hpRatio = unit.hp / unit.maxHp;

        // Background
        ctx.fillStyle = '#222222';
        ctx.fillRect(barX - 0.5, barY - 0.5, barWidth + 1, barHeight + 1);

        // HP fill (green → yellow → red)
        const hpColor =
          hpRatio > 0.5 ? '#44cc44' : hpRatio > 0.25 ? '#ccaa00' : '#cc4444';
        ctx.fillStyle = hpColor;
        ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

        // Border
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Team pennant flag above ship — drawn programmatically with flag color
        const fColor = isPlayer ? (game.flagColor || '#4488ff') : '#ff6666';
        const poleH = HEX_RADIUS * 0.5;
        const pennantW = HEX_RADIUS * 0.3;
        const pennantH = HEX_RADIUS * 0.4;
        const poleTopY = cy - spriteSize - poleH;

        // Pennant pole
        ctx.save();
        ctx.strokeStyle = '#8B7355';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - spriteSize);
        ctx.lineTo(cx, poleTopY + pennantH * 0.7);
        ctx.stroke();

        // Pennant flag (triangle)
        ctx.fillStyle = fColor;
        ctx.beginPath();
        ctx.moveTo(cx, poleTopY);
        ctx.lineTo(cx + pennantW, poleTopY + pennantH * 0.5);
        ctx.lineTo(cx, poleTopY + pennantH);
        ctx.closePath();
        ctx.fill();

        // Pennant outline
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── 4. Explosion effect ──
    if (explosion) {
      const { x, y } = hexToPixel(explosion.q, explosion.r);
      const cx = x + offsetX;
      const cy = y + offsetY;
      const expSize = HEX_RADIUS * 1.2;
      if (explosionImg && explosionImg.complete) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(explosionImg, cx - expSize, cy - expSize, expSize * 2, expSize * 2);
        ctx.globalAlpha = 1.0;
      }
    }

    // ── 4b. Draw treasure chests on map ──
    if (state && state.treasures) {
      for (const treasure of state.treasures) {
        const { x, y } = hexToPixel(treasure.q, treasure.r);
        const cx = x + offsetX;
        const cy = y + offsetY;
        const chestSize = HEX_RADIUS * 0.55;

        // Glowing golden highlight behind the chest
        ctx.save();
        drawHexPath(cx, cy);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
        ctx.fill();
        ctx.restore();

        // Pulsing glow effect
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.003);
        ctx.save();
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 12 * pulse;

        if (treasurechestImg && treasurechestImg.complete && treasurechestImg.naturalWidth > 0) {
          ctx.drawImage(treasurechestImg, cx - chestSize, cy - chestSize, chestSize * 2, chestSize * 2);
        } else {
          // Fallback: golden circle with "?" if image not loaded
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.arc(cx, cy, chestSize * 0.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#2a1a0a';
          ctx.font = `bold ${Math.round(chestSize)}px Georgia`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', cx, cy);
        }
        ctx.restore();
      }
    }

    // ── 5. Draw hover highlight overlay (top-most) ──
    if (hover) {
      const { x, y } = hexToPixel(hover.q, hover.r);
      const cx = x + offsetX;
      const cy = y + offsetY;

      drawHexPath(cx, cy);
      ctx.fillStyle = 'rgba(204, 204, 204, 0.4)';
      ctx.fill();
    }
  }, []);

  // ────────────────────── SHIP MOVEMENT ANIMATION ───────────────────────

  const startShipAnimation = useCallback((path, unitId, cost) => {
    if (!path || path.length < 2) return;

    const SEGMENT_DURATION = 400; // ms per hex step
    const totalDuration = (path.length - 1) * SEGMENT_DURATION;

    isAnimatingRef.current = true;
    animationRef.current = {
      path,
      unitId,
      cost,
      startTime: performance.now(),
      totalDuration,
      segmentDuration: SEGMENT_DURATION,
    };

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const animateFrame = (now) => {
      const anim = animationRef.current;
      if (!anim) return;

      const elapsed = now - anim.startTime;
      const progress = Math.min(elapsed / anim.totalDuration, 1);

      // Determine which segment we're on and local progress within it
      const totalSegments = anim.path.length - 1;
      const rawSegment = progress * totalSegments;
      const segmentIndex = Math.min(Math.floor(rawSegment), totalSegments - 1);
      const localProgress = rawSegment - segmentIndex;

      // Ease in-out for smooth movement
      const t = localProgress;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      // Interpolate pixel position between hex centers
      const fromHex = anim.path[segmentIndex];
      const toHex = anim.path[segmentIndex + 1];
      const fromPixel = hexToPixel(fromHex.q, fromHex.r);
      const toPixel = hexToPixel(toHex.q, toHex.r);

      const { offsetX, offsetY } = gridOffsetRef.current;
      const interpX = fromPixel.x + (toPixel.x - fromPixel.x) * eased + offsetX;
      const interpY = fromPixel.y + (toPixel.y - fromPixel.y) * eased + offsetY;

      // Redraw the frame with the animating unit at interpolated position
      const { width, height } = canvasSizeRef.current;
      const gs = gameStateRef.current;
      draw(ctx, width, height, hoveredHexRef.current, {
        units: gs.units,
        selectedUnit: gs.selectedUnit,
        validMoveSet: gs.validMoveSet,
        validTargetSet: gs.validTargetSet,
        treasures: gs.treasures,
      }, explosionEffect, { unitId: anim.unitId, cx: interpX, cy: interpY }, {
        visible: gs.visibleHexes || new Set(),
        explored: exploredHexesRef.current,
      });

      if (progress < 1) {
        requestAnimationFrame(animateFrame);
      } else {
        // Animation complete — apply state change
        const finalHex = anim.path[anim.path.length - 1];
        game.finalizeMove(anim.unitId, finalHex.q, finalHex.r, anim.cost);
        animationRef.current = null;
        isAnimatingRef.current = false;
      }
    };

    requestAnimationFrame(animateFrame);
  }, [draw, game, explosionEffect]);

  // ──────────────────────────── SETUP EFFECT ────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = window.innerWidth;
      const displayHeight = window.innerHeight;

      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;

      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      ctx.scale(dpr, dpr);

      // Resize particle overlay canvas too
      const pCanvas = particleCanvasRef.current;
      if (pCanvas) {
        pCanvas.width = displayWidth * dpr;
        pCanvas.height = displayHeight * dpr;
        pCanvas.style.width = `${displayWidth}px`;
        pCanvas.style.height = `${displayHeight}px`;
        const pCtx = pCanvas.getContext('2d');
        pCtx.scale(dpr, dpr);
      }

      // Store offset for event handlers
      const centerHexX = (GRID_WIDTH - 1) / 2;
      const centerHexY = (GRID_HEIGHT - 1) / 2;
      const centerPixel = hexToPixel(centerHexX, centerHexY);
      gridOffsetRef.current = {
        offsetX: displayWidth / 2 - centerPixel.x,
        offsetY: displayHeight / 2 - centerPixel.y,
      };
      canvasSizeRef.current = { width: displayWidth, height: displayHeight };

      // Redraw with latest state
      const gs = gameStateRef.current;
      draw(ctx, displayWidth, displayHeight, hoveredHexRef.current, {
        units: gs.units,
        selectedUnit: gs.selectedUnit,
        validMoveSet: gs.validMoveSet,
        validTargetSet: gs.validTargetSet,
        treasures: gs.treasures,
      }, explosionEffect, null, {
        visible: gs.visibleHexes || new Set(),
        explored: exploredHexesRef.current,
      });
    };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setMousePos({ x: e.clientX, y: e.clientY });

      const { offsetX, offsetY } = gridOffsetRef.current;
      const hexCoords = pixelToHex(px - offsetX, py - offsetY);
      const rounded = hexRound(hexCoords.q, hexCoords.r);

      if (
        rounded.q >= 0 &&
        rounded.q < GRID_WIDTH &&
        rounded.r >= 0 &&
        rounded.r < GRID_HEIGHT
      ) {
        const last = lastHoveredHexRef.current;
        if (!last || last.q !== rounded.q || last.r !== rounded.r) {
          lastHoveredHexRef.current = rounded;
          setHoveredHex(rounded);
        }
        // Check if a unit exists at this hex
        const gs = gameStateRef.current;
        const unitAtHex = gs.units.find(
          u => u.q === rounded.q && u.r === rounded.r && u.hp > 0,
        );
        setHoveredUnit(unitAtHex ?? null);
      } else {
        if (lastHoveredHexRef.current !== null) {
          lastHoveredHexRef.current = null;
          setHoveredHex(null);
        }
        setHoveredUnit(null);
      }
    };

    const handleClick = (e) => {
      // Block all input during ship animation
      if (isAnimatingRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const { offsetX, offsetY } = gridOffsetRef.current;
      const hexCoords = pixelToHex(px - offsetX, py - offsetY);
      const rounded = hexRound(hexCoords.q, hexCoords.r);

      if (
        rounded.q < 0 ||
        rounded.q >= GRID_WIDTH ||
        rounded.r < 0 ||
        rounded.r >= GRID_HEIGHT
      ) {
        return;
      }

      const gs = gameStateRef.current;

      // Find unit at clicked hex
      const clickedUnit = gs.units.find(
        u => u.q === rounded.q && u.r === rounded.r && u.hp > 0
      );

      if (gs.selectedUnitId) {
        // A unit is already selected
        const selUnit = gs.units.find(u => u.id === gs.selectedUnitId);

        // 1. Check attack — clicking an enemy in valid targets
        if (clickedUnit && clickedUnit.owner !== selUnit.owner) {
          const isTarget = gs.validTargets.some(t => t.id === clickedUnit.id);
          if (isTarget) {
            gs.attackUnit(clickedUnit.id);
            return;
          }
        }

        // 2. Check movement — clicking a valid move hex → animate
        if (gs.validMoveSet.has(`${rounded.q},${rounded.r}`)) {
          const moveResult = gs.moveUnit(rounded.q, rounded.r);
          if (moveResult) {
            // Start animation
            const { path, unitId, cost } = moveResult;
            startShipAnimation(path, unitId, cost);
          }
          return;
        }

        // 3. Click on another own unit → switch selection
        if (clickedUnit && clickedUnit.owner === 'player') {
          gs.selectUnit(clickedUnit.id);
          return;
        }

        // 4. Click elsewhere → deselect
        gs.deselectUnit();
      } else {
        // No unit selected — try to select a player unit
        if (clickedUnit && clickedUnit.owner === 'player') {
          gs.selectUnit(clickedUnit.id);
        }
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
    // draw is stable ([] deps), so this effect only runs once.
    // We intentionally exclude hoveredHex and game state here —
    // those re-renders are handled by the dedicated redraw effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw]);

  // ──────────────── PARTICLE ANIMATION LOOP (overlay canvas) ────────────────

  useEffect(() => {
    const pCanvas = particleCanvasRef.current;
    if (!pCanvas) return;

    const pCtx = pCanvas.getContext('2d');
    let running = true;
    lastFrameTimeRef.current = performance.now();
    rippleTimerRef.current = 0;

    const animate = (now) => {
      if (!running) return;
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1); // cap at 100ms
      lastFrameTimeRef.current = now;

      // Update particle physics
      updateParticles(dt);

      // Spawn ambient water ripples on ocean tiles periodically
      rippleTimerRef.current += dt;
      if (rippleTimerRef.current > 0.8) {
        rippleTimerRef.current = 0;
        const { offsetX, offsetY } = gridOffsetRef.current;
        // Pick 2-3 random water tiles for ripples
        for (let i = 0; i < 3; i++) {
          const q = Math.floor(Math.random() * GRID_WIDTH);
          const r = Math.floor(Math.random() * GRID_HEIGHT);
          const terrain = getTileTerrain(q, r);
          if (terrain === TERRAIN.OCEAN || terrain === TERRAIN.SHALLOW) {
            const pixel = hexToPixel(q, r);
            spawnWaterRipple(pixel.x + offsetX, pixel.y + offsetY);
          }
        }
      }

      // ── Water shimmer — animated wave highlights on ocean tiles ──
      const waveTime = now * 0.001;
      const { offsetX, offsetY } = gridOffsetRef.current;
      pCtx.save();
      for (let q = 0; q < GRID_WIDTH; q++) {
        for (let r = 0; r < GRID_HEIGHT; r++) {
          const terrain = getTileTerrain(q, r);
          if (terrain === TERRAIN.OCEAN || terrain === TERRAIN.SHALLOW || terrain === TERRAIN.DEEP_OCEAN) {
            const { x, y } = hexToPixel(q, r);
            const cx = x + offsetX;
            const cy = y + offsetY;

            // Subtle shimmer line that drifts across the tile
            const shimmerOffset = Math.sin(waveTime * 1.2 + q * 0.7 + r * 1.1) * HEX_RADIUS * 0.5;
            const opacity = 0.04 + 0.03 * Math.sin(waveTime * 0.8 + q * 1.3 + r * 0.9);

            pCtx.strokeStyle = `rgba(180, 220, 255, ${opacity})`;
            pCtx.lineWidth = 1.5;
            pCtx.beginPath();
            pCtx.moveTo(cx - HEX_RADIUS * 0.7, cy + shimmerOffset);
            pCtx.quadraticCurveTo(
              cx, cy + shimmerOffset - HEX_RADIUS * 0.15,
              cx + HEX_RADIUS * 0.7, cy + shimmerOffset,
            );
            pCtx.stroke();
          }
        }
      }
      pCtx.restore();

      // Clear particle canvas and draw
      const dpr = window.devicePixelRatio || 1;
      const w = pCanvas.width / dpr;
      const h = pCanvas.height / dpr;
      pCtx.save();
      pCtx.setTransform(1, 0, 0, 1, 0, 0); // reset to clear full buffer
      pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
      pCtx.restore();

      drawParticles(pCtx);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Fog of War: track explored hexes ──
  useEffect(() => {
    if (game.visibleHexes) {
      for (const h of game.visibleHexes) {
        exploredHexesRef.current.add(h);
      }
    }
  }, [game.visibleHexes]);

  // ────────────────────── REDRAW ON HOVER CHANGE ───────────────────────

  useEffect(() => {
    if (isAnimatingRef.current) return; // skip during animation
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvasSizeRef.current;
    if (width && height) {
      const gs = gameStateRef.current;
      draw(ctx, width, height, hoveredHex, {
        units: gs.units,
        selectedUnit: gs.selectedUnit,
        validMoveSet: gs.validMoveSet,
        validTargetSet: gs.validTargetSet,
        treasures: gs.treasures,
      }, explosionEffect, null, {
        visible: gs.visibleHexes || new Set(),
        explored: exploredHexesRef.current,
      });
    }
  }, [draw, hoveredHex, explosionEffect]);

  // ────────────────── REDRAW ON GAME STATE CHANGE ──────────────────────

  useEffect(() => {
    if (isAnimatingRef.current) return; // skip during animation
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvasSizeRef.current;
    if (width && height) {
      draw(ctx, width, height, hoveredHexRef.current, {
        units: game.units,
        selectedUnit: game.selectedUnit,
        validMoveSet: game.validMoveSet,
        validTargetSet: game.validTargetSet,
        treasures: game.treasures,
      }, explosionEffect, null, {
        visible: game.visibleHexes || new Set(),
        explored: exploredHexesRef.current,
      });
    }
  }, [
    draw,
    game.units,
    game.selectedUnitId,
    game.validMoveSet,
    game.validTargetSet,
    game.gamePhase,
    explosionEffect,
  ]);

  // ────────────────────── AI TURN HANDLING ─────────────────────────────

  useEffect(() => {
    if (game.gamePhase === 'aiTurn') {
      const timer = setTimeout(() => {
        game.executeAiTurn();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [game.gamePhase, game.executeAiTurn]);

  // ──────────────────────────── RENDER ─────────────────────────────────

  const selectedUnitInfo = game.selectedUnit;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          background: '#050510',
          width: '100%',
          height: '100%',
        }}
      />
      {/* Particle overlay — sits on top, pointer-events: none */}
      <canvas
        ref={particleCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* ── Turn Indicator (top-left) ── */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: 'rgba(10, 10, 30, 0.85)',
          border: '1px solid #334',
          borderRadius: 8,
          padding: '10px 18px',
          color: '#d4d4e8',
          fontFamily: 'Georgia, serif',
          fontSize: 16,
          lineHeight: 1.4,
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: 18, color: '#f0c040' }}>
          {game.gameMode === 'waveDefense' ? `🌊 Wave ${game.wave}` : `⚓ Turn ${game.currentTurn}`}
        </div>
        <div style={{ marginTop: 2, fontSize: 14, color: game.gamePhase === 'playerTurn' ? '#88ddff' : '#ff8888' }}>
          {game.gamePhase === 'playerTurn' && (game.gameMode === 'waveDefense' ? 'Defend!' : 'Your Move')}
          {game.gamePhase === 'aiTurn' && 'Enemy Turn...'}
          {game.gamePhase === 'upgradePhase' && '⚡ Prepare!'}
          {game.gamePhase === 'gameOver' && (game.winner === 'player' ? 'Victory!' : 'Defeat')}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: '#c8a86e', fontStyle: 'italic' }}>
          ⚓ {game.captainName}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
          Ships: {game.playerUnits.length}vs{game.aiUnits.length}
        </div>
        {game.gameMode === 'waveDefense' ? (
          <div style={{ marginTop: 4, fontSize: 12, color: '#ffaa44' }}>
            🏆 High Score: {game.highScore}
          </div>
        ) : (
          <div style={{ marginTop: 4, fontSize: 13, color: '#ffd700' }}>
            💰 Treasure: {game.playerTreasures} — {game.aiTreasures} | Left: {game.treasures.length}
          </div>
        )}
        {(game.upgradeBonuses.hp > 0 || game.upgradeBonuses.movement > 0 || game.upgradeBonuses.attack > 0) && (
          <div style={{ marginTop: 4, fontSize: 11, color: '#88ddff', display: 'flex', gap: 8 }}>
            {game.upgradeBonuses.hp > 0 && <span>❤️+{game.upgradeBonuses.hp}</span>}
            {game.upgradeBonuses.movement > 0 && <span>👢+{game.upgradeBonuses.movement}</span>}
            {game.upgradeBonuses.attack > 0 && <span>⚔️+{game.upgradeBonuses.attack}</span>}
          </div>
        )}
        <div
          onClick={() => setShowSettings(true)}
          style={{
            marginTop: 8,
            fontSize: 16,
            cursor: 'pointer',
            opacity: 0.5,
            transition: 'opacity 0.2s',
            textAlign: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
          title="Customize"
        >
          ⚙️
        </div>
      </div>

      {/* ── End Turn Button (top-right) ── */}
      {game.gamePhase === 'playerTurn' && (
        <button
          onClick={game.endTurn}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'Georgia, serif',
            fontSize: 16,
            fontWeight: 'bold',
            color: '#f0d080',
            letterSpacing: 1,
            width: 130,
            height: 38,
            overflow: 'hidden',
            transition: 'filter 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
        >
          {woodButtonImg && woodButtonImg.complete && woodButtonImg.naturalWidth > 0 ? (
            <img
              src={woodButtonUrl}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
          ) : (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, #2a1a0a, #3a2a1a)',
              border: '2px solid #8a7a5a',
              borderRadius: 8,
            }} />
          )}
          <span style={{ position: 'relative', zIndex: 1, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            ⚓ End Turn
          </span>
        </button>
      )}

      {/* ── Unit Info Panel (bottom) ── */}
      {selectedUnitInfo && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 10, 30, 0.9)',
            border: '1px solid #ffd700',
            borderRadius: 10,
            padding: '12px 24px',
            color: '#d4d4e8',
            fontFamily: 'Georgia, serif',
            minWidth: 260,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#f0c040', marginBottom: 2 }}>
            {selectedUnitInfo.owner === 'player' ? '⛵' : '☠️'}{' '}
            {UNIT_TYPES[selectedUnitInfo.type]?.label || selectedUnitInfo.type}
          </div>
          <div style={{ fontSize: 12, color: '#aa9966', marginBottom: 6, fontStyle: 'italic' }}>
            {selectedUnitInfo.shipName}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 14, marginTop: 4 }}>
            <span>
              <img src={heartUrl} alt="HP" style={{ width: 16, height: 16, verticalAlign: 'middle', marginRight: 4 }} />
              <span style={{ color: selectedUnitInfo.hp > 3 ? '#44cc44' : selectedUnitInfo.hp > 1 ? '#ccaa00' : '#cc4444' }}>
                {selectedUnitInfo.hp}/{selectedUnitInfo.maxHp}
              </span>
            </span>
            <span>
              <img src={bootUrl} alt="Move" style={{ width: 16, height: 16, verticalAlign: 'middle', marginRight: 4 }} />
              <span style={{ color: selectedUnitInfo.movementPoints > 0 ? '#88ddff' : '#666' }}>
                {selectedUnitInfo.movementPoints}/{selectedUnitInfo.maxMovement}
              </span>
            </span>
            <span>
              <img src={crosscannonUrl} alt="ATK" style={{ width: 16, height: 16, verticalAlign: 'middle', marginRight: 4 }} />
              <span style={{ color: selectedUnitInfo.attacked ? '#666' : '#ff8888' }}>
                {selectedUnitInfo.attack}
              </span>
            </span>
          </div>
          {/* Ability button */}
          {selectedUnitInfo.owner === 'player' && UNIT_TYPES[selectedUnitInfo.type]?.ability && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => { game.activateAbility(); playAbility(); }}
                disabled={!selectedUnitInfo.abilityReady}
                style={{
                  background: selectedUnitInfo.abilityReady
                    ? 'linear-gradient(135deg, #1a0a2a, #3a1a4a)'
                    : 'rgba(30,30,30,0.5)',
                  border: selectedUnitInfo.abilityReady ? '2px solid #aa44ff' : '1px solid #444',
                  borderRadius: 8,
                  padding: '6px 18px',
                  color: selectedUnitInfo.abilityReady ? '#d4b0ff' : '#555',
                  fontFamily: 'Georgia, serif',
                  fontSize: 13,
                  fontWeight: 'bold',
                  cursor: selectedUnitInfo.abilityReady ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                }}
                title={UNIT_TYPES[selectedUnitInfo.type].abilityDesc}
              >
                ✨ {UNIT_TYPES[selectedUnitInfo.type].abilityLabel}
                {!selectedUnitInfo.abilityReady && ` (CD: ${selectedUnitInfo.abilityCooldownTurns})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Unit Tooltip (hover) ── */}
      {hoveredUnit && !selectedUnitInfo && (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 16,
            top: mousePos.y - 10,
            background: 'rgba(10, 10, 30, 0.92)',
            border: '1px solid rgba(255,215,0,0.4)',
            borderRadius: 8,
            padding: '8px 14px',
            color: '#d4d4e8',
            fontFamily: 'Georgia, serif',
            fontSize: 13,
            pointerEvents: 'none',
            zIndex: 20,
            minWidth: 140,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ fontWeight: 'bold', color: '#f0c040', marginBottom: 2, fontSize: 14 }}>
            {hoveredUnit.owner === 'player' ? '⛵' : '☠️'}{' '}
            {UNIT_TYPES[hoveredUnit.type]?.label || hoveredUnit.type}
          </div>
          <div style={{ fontSize: 11, color: '#aa9966', marginBottom: 4, fontStyle: 'italic' }}>
            {hoveredUnit.shipName}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
            <span>
              ❤️ {hoveredUnit.hp}/{hoveredUnit.maxHp}
            </span>
            <span style={{ color: hoveredUnit.movementPoints > 0 ? '#88ddff' : '#666' }}>
              👢 {hoveredUnit.movementPoints}/{hoveredUnit.maxMovement}
            </span>
            <span style={{ color: hoveredUnit.attacked ? '#666' : '#ff8888' }}>
              🔫 {hoveredUnit.attack}
            </span>
          </div>
        </div>
      )}

      {/* ── Upgrade Phase Overlay (every 3 turns) ── */}
      {game.gamePhase === 'upgradePhase' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.75)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 'bold',
              fontFamily: 'Georgia, serif',
              color: '#f0c040',
              textShadow: '0 0 20px rgba(255, 215, 0, 0.4)',
              marginBottom: 8,
            }}
          >
            ⬆️ Ship Upgrade!
          </div>
          <div style={{ color: '#aaa', fontSize: 14, marginBottom: 24, fontFamily: 'Georgia, serif' }}>
            {game.gameMode === 'waveDefense'
              ? `Wave ${game.wave - 1} cleared! Choose a bonus for your fleet`
              : `Turn ${game.currentTurn} — choose a bonus for your entire fleet`}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {/* HP upgrade */}
            <div
              onClick={() => game.applyUpgrade('hp')}
              style={{
                background: 'rgba(20, 40, 20, 0.9)',
                border: '2px solid #44cc44',
                borderRadius: 12,
                padding: '20px 28px',
                cursor: 'pointer',
                textAlign: 'center',
                minWidth: 130,
                transition: 'transform 0.2s, border-color 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.borderColor = '#66ee66'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = '#44cc44'; }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>❤️</div>
              <div style={{ color: '#44cc44', fontSize: 20, fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>+1 HP</div>
              <div style={{ color: '#888', fontSize: 12, marginTop: 6, fontFamily: 'sans-serif' }}>
                Max HP +1<br/>Heal 1 HP
              </div>
            </div>

            {/* Movement upgrade */}
            <div
              onClick={() => game.applyUpgrade('movement')}
              style={{
                background: 'rgba(20, 40, 60, 0.9)',
                border: '2px solid #4488ff',
                borderRadius: 12,
                padding: '20px 28px',
                cursor: 'pointer',
                textAlign: 'center',
                minWidth: 130,
                transition: 'transform 0.2s, border-color 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.borderColor = '#66aaff'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = '#4488ff'; }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>👢</div>
              <div style={{ color: '#4488ff', fontSize: 20, fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>+1 Move</div>
              <div style={{ color: '#888', fontSize: 12, marginTop: 6, fontFamily: 'sans-serif' }}>
                Movement +1<br/>All ships faster
              </div>
            </div>

            {/* Attack upgrade */}
            <div
              onClick={() => game.applyUpgrade('attack')}
              style={{
                background: 'rgba(60, 20, 20, 0.9)',
                border: '2px solid #ff4444',
                borderRadius: 12,
                padding: '20px 28px',
                cursor: 'pointer',
                textAlign: 'center',
                minWidth: 130,
                transition: 'transform 0.2s, border-color 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.borderColor = '#ff6666'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = '#ff4444'; }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚔️</div>
              <div style={{ color: '#ff4444', fontSize: 20, fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>+1 ATK</div>
              <div style={{ color: '#888', fontSize: 12, marginTop: 6, fontFamily: 'sans-serif' }}>
                Attack +1<br/>Deal more damage
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Overlay ── */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.8)',
            zIndex: 20,
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'rgba(15, 15, 40, 0.95)',
              border: '2px solid #8a7a5a',
              borderRadius: 16,
              padding: '32px 40px',
              minWidth: 340,
              fontFamily: 'Georgia, serif',
              color: '#d4d4e8',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#f0c040', marginBottom: 24, textAlign: 'center' }}>
              ⚙️ Captain's Quarters
            </div>

            {/* Captain Name */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, color: '#aaa', marginBottom: 6 }}>Captain Name</div>
              <input
                value={game.captainName}
                onChange={e => game.setCaptainName(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid #5a4a3a',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#f0d080',
                  fontSize: 16,
                  fontFamily: 'Georgia, serif',
                  outline: 'none',
                }}
                placeholder="Captain Ed"
              />
            </div>

            {/* Flagship Name */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, color: '#aaa', marginBottom: 6 }}>Flagship Name</div>
              <input
                value={game.flagshipName}
                onChange={e => game.setFlagshipName(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid #5a4a3a',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#f0d080',
                  fontSize: 16,
                  fontFamily: 'Georgia, serif',
                  outline: 'none',
                }}
                placeholder="Sea Serpent"
              />
            </div>

            {/* Flag Color */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, color: '#aaa', marginBottom: 10 }}>Flag Color</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                {Object.entries(FLAG_COLORS).map(([name, color]) => (
                  <div
                    key={name}
                    onClick={() => game.setFlagColor(color)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: color,
                      cursor: 'pointer',
                      border: game.flagColor === color ? '3px solid #fff' : '3px solid transparent',
                      boxShadow: game.flagColor === color ? `0 0 12px ${color}` : 'none',
                      transition: 'all 0.2s',
                    }}
                    title={name}
                  />
                ))}
              </div>
            </div>

            {/* AI Aggression */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, color: '#aaa', marginBottom: 6 }}>
                🤖 AI Aggression: {Math.round(game.aiAggression * 100)}%
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round((game.aiAggression || 0.5) * 100)}
                onChange={e => game.setAiAggression(parseInt(e.target.value) / 100)}
                style={{
                  width: '100%',
                  accentColor: '#aa44ff',
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginTop: 2 }}>
                <span>🐢 Passive</span>
                <span>⚖️ Balanced</span>
                <span>🔥 Aggressive</span>
              </div>
            </div>

            {/* Close button */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  background: 'linear-gradient(135deg, #2a1a0a, #3a2a1a)',
                  border: '2px solid #8a7a5a',
                  borderRadius: 8,
                  padding: '10px 32px',
                  color: '#f0d080',
                  fontFamily: 'Georgia, serif',
                  fontSize: 16,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                ⚓ Ahoy!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Game Over Overlay ── */}
      {game.gamePhase === 'gameOver' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 'bold',
              fontFamily: 'Georgia, serif',
              color: game.gameMode === 'skirmish' && game.winner === 'player' ? '#ffd700' : '#cc4444',
              textShadow: game.gameMode === 'skirmish' && game.winner === 'player'
                ? '0 0 30px rgba(255, 215, 0, 0.5)'
                : '0 0 30px rgba(255, 255, 255, 0.3)',
              marginBottom: 12,
            }}
          >
            {game.gameMode === 'skirmish' && game.winner === 'player' ? '🏴‍☠️ Victory!' : '💀 Defeat...'}
          </div>
          <div style={{ color: '#aaa', fontSize: 18, marginBottom: 8 }}>
            {game.gameMode === 'skirmish' && game.winner === 'player'
              ? 'All enemy ships have been sunk!'
              : 'Your fleet has been destroyed.'}
          </div>
          {game.gameMode === 'waveDefense' && (
            <div style={{ color: '#ffaa44', fontSize: 22, marginBottom: 4, fontFamily: 'Georgia, serif' }}>
              🌊 Survived {game.wave - 1} waves
            </div>
          )}
          <div style={{ color: '#ffaa44', fontSize: 14, marginBottom: 24 }}>
            🏆 {game.gameMode === 'waveDefense' ? 'Best: ' : 'Treasures: '}
            {game.gameMode === 'waveDefense' ? game.highScore : game.playerTreasures}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'linear-gradient(135deg, #2a1a0a, #3a2a1a)',
              border: '2px solid #8a7a5a',
              borderRadius: 8,
              padding: '12px 32px',
              color: '#f0d080',
              fontFamily: 'Georgia, serif',
              fontSize: 18,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            ⚓ Play Again
          </button>
        </div>
      )}
    </div>
  );
}

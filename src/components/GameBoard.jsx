import { useEffect, useRef, useCallback, useState } from 'react';
import {
  HEX_RADIUS,
  hexToPixel,
  pixelToHex,
  hexRound,
  hexCorner,
  getTileTerrain,
  getTerrainColor,
} from '../hooks/useHexGrid.js';
import { useGameState, UNIT_TYPES } from '../hooks/useGameState.js';

// ── Asset imports (Vite returns URL strings, so we wrap in Image()) ──
import sloopUrl from '../assets/sloop.jpg';
import brigantineUrl from '../assets/brigantine2.jpg';
import galleonUrl from '../assets/galleon.jpg';
import oceanUrl from '../assets/ocean.jpg';
import landUrl from '../assets/land.jpg';
import jungleUrl from '../assets/jungle.jpg';
import heartUrl from '../assets/heart.jpg';
import bootUrl from '../assets/boot.jpg';
import crosscannonUrl from '../assets/crosscannon.jpg';
import explosionUrl from '../assets/explosion.jpg';

// Convert Vite URL strings to HTMLImageElements for ctx.drawImage()
function makeImg(url) { const i = new Image(); i.src = url; return i; }
const sloopImg = makeImg(sloopUrl);
const brigantineImg = makeImg(brigantineUrl);
const galleonImg = makeImg(galleonUrl);
const oceanImg = makeImg(oceanUrl);
const landImg = makeImg(landUrl);
const jungleImg = makeImg(jungleUrl);
const heartImg = makeImg(heartUrl);
const bootImg = makeImg(bootUrl);
const crosscannonImg = makeImg(crosscannonUrl);
const explosionImg = makeImg(explosionUrl);

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

function GameBoard() {
  const canvasRef = useRef(null);
  const [hoveredHex, setHoveredHex] = useState(null);
  const lastHoveredHexRef = useRef(null);
  const gridOffsetRef = useRef({ offsetX: 0, offsetY: 0 });
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const hoveredHexRef = useRef(null);
  const [explosionEffect, setExplosionEffect] = useState(null);
  const prevLastAttackRef = useRef(null);

  // Keep a ref synced with current hoveredHex to avoid stale closures in event handlers
  hoveredHexRef.current = hoveredHex;

  // Game state hook
  const game = useGameState();
  const gameStateRef = useRef(game);
  gameStateRef.current = game;

  // ── Explosion effect from lastAttack ──
  useEffect(() => {
    if (game.lastAttack && game.lastAttack !== prevLastAttackRef.current) {
      prevLastAttackRef.current = game.lastAttack;
      setExplosionEffect({
        q: game.lastAttack.q,
        r: game.lastAttack.r,
        timestamp: game.lastAttack.timestamp,
      });
      const timer = setTimeout(() => setExplosionEffect(null), 500);
      return () => clearTimeout(timer);
    }
  }, [game.lastAttack]);

  // ────────────────────────────── DRAW FUNCTION ──────────────────────────────

  const draw = useCallback((ctx, width, height, hover, state, explosion) => {
    // state = { units, selectedUnit, validMoveSet, validTargetSet } or null
    ctx.clearRect(0, 0, width, height);

    // Calculate the pixel offset to center the grid
    const centerHexX = (GRID_WIDTH - 1) / 2;
    const centerHexY = (GRID_HEIGHT - 1) / 2;
    const centerPixel = hexToPixel(centerHexX, centerHexY);

    const offsetX = width / 2 - centerPixel.x;
    const offsetY = height / 2 - centerPixel.y;

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

    // ── 3. Draw units as sprite images (clipped to hex + chroma-key blue bg) ──
    if (state && state.units) {
      for (const unit of state.units) {
        if (unit.hp <= 0) continue;

        const { x, y } = hexToPixel(unit.q, unit.r);
        const cx = x + offsetX;
        const cy = y + offsetY;

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
      }, explosionEffect);
    };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

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
      } else {
        if (lastHoveredHexRef.current !== null) {
          lastHoveredHexRef.current = null;
          setHoveredHex(null);
        }
      }
    };

    const handleClick = (e) => {
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

        // 2. Check movement — clicking a valid move hex
        if (gs.validMoveSet.has(`${rounded.q},${rounded.r}`)) {
          gs.moveUnit(rounded.q, rounded.r);
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

  // ────────────────────── REDRAW ON HOVER CHANGE ───────────────────────

  useEffect(() => {
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
      }, explosionEffect);
    }
  }, [draw, hoveredHex, explosionEffect]);

  // ────────────────── REDRAW ON GAME STATE CHANGE ──────────────────────

  useEffect(() => {
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
      }, explosionEffect);
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
          ⚓ Turn {game.currentTurn}
        </div>
        <div style={{ marginTop: 2, fontSize: 14, color: game.gamePhase === 'playerTurn' ? '#88ddff' : '#ff8888' }}>
          {game.gamePhase === 'playerTurn' && 'Your Move'}
          {game.gamePhase === 'aiTurn' && 'Enemy Turn...'}
          {game.gamePhase === 'gameOver' && (game.winner === 'player' ? 'Victory!' : 'Defeat')}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
          Ships: {game.playerUnits.length}vs{game.aiUnits.length}
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
            background: 'linear-gradient(135deg, #2a1a0a, #3a2a1a)',
            border: '2px solid #8a7a5a',
            borderRadius: 8,
            padding: '10px 22px',
            color: '#f0d080',
            fontFamily: 'Georgia, serif',
            fontSize: 16,
            fontWeight: 'bold',
            cursor: 'pointer',
            letterSpacing: 1,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.target.style.borderColor = '#c0a060'; e.target.style.background = 'linear-gradient(135deg, #3a2a1a, #4a3a2a)'; }}
          onMouseLeave={e => { e.target.style.borderColor = '#8a7a5a'; e.target.style.background = 'linear-gradient(135deg, #2a1a0a, #3a2a1a)'; }}
        >
          ⚓ End Turn
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
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#f0c040', marginBottom: 6 }}>
            {selectedUnitInfo.owner === 'player' ? '⛵' : '☠️'}{' '}
            {UNIT_TYPES[selectedUnitInfo.type]?.label || selectedUnitInfo.type}
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
              color: game.winner === 'player' ? '#ffd700' : '#cc4444',
              textShadow: '0 0 30px rgba(255, 215, 0, 0.5)',
              marginBottom: 12,
            }}
          >
            {game.winner === 'player' ? '🏴‍☠️ Victory!' : '💀 Defeat...'}
          </div>
          <div style={{ color: '#aaa', fontSize: 18, marginBottom: 24 }}>
            {game.winner === 'player'
              ? 'All enemy ships have been sunk!'
              : 'Your fleet has been destroyed.'}
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

export default GameBoard;

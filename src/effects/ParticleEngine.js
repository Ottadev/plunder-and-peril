/**
 * ParticleEngine — lightweight pooled particle system for Canvas 2D.
 *
 * Pool pre-allocates MAX_PARTICLES objects and reuses them to avoid GC churn.
 * Each particle: { x, y, vx, vy, life, maxLife, size, r, g, b, a, drag, gravity, type }
 *
 * Performance cap: ~300 simultaneous particles.
 */

const MAX_PARTICLES = 300;

// Pre-allocate the pool as a flat array of objects
const pool = [];
for (let i = 0; i < MAX_PARTICLES; i++) {
  pool.push({
    active: false,
    x: 0, y: 0,
    vx: 0, vy: 0,
    life: 0, maxLife: 0,
    size: 0,
    r: 0, g: 0, b: 0, a: 0,
    drag: 1,
    gravity: 0,
    type: 'circle', // 'circle' | 'ring' | 'smoke'
  });
}

let activeCount = 0;

/**
 * Grab an inactive particle from the pool. Returns null if pool exhausted.
 */
function acquire() {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!pool[i].active) {
      pool[i].active = true;
      activeCount++;
      return pool[i];
    }
  }
  return null; // pool full
}

/**
 * Update all active particles for one frame (dt in seconds).
 */
export function updateParticles(dt) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = pool[i];
    if (!p.active) continue;

    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      activeCount--;
      continue;
    }

    p.vx *= p.drag;
    p.vy *= p.drag;
    p.vy += p.gravity * dt;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

/**
 * Draw all active particles onto the given ctx.
 */
export function drawParticles(ctx) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = pool[i];
    if (!p.active) continue;

    const lifeRatio = p.life / p.maxLife;
    const alpha = p.a * lifeRatio;
    if (alpha < 0.01) continue;

    ctx.globalAlpha = alpha;

    if (p.type === 'smoke') {
      // Expanding smoke puff
      const expandSize = p.size * (1 + (1 - lifeRatio) * 2);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, expandSize, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'ring') {
      // Expanding ring (for water ripples)
      const ringRadius = p.size * (1 + (1 - lifeRatio) * 3);
      ctx.strokeStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
      ctx.lineWidth = 1.5 * lifeRatio;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Default circle particle
      const sz = p.size * (0.5 + lifeRatio * 0.5); // shrink over life
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Get current active particle count (for debug / HUD).
 */
export function getActiveCount() {
  return activeCount;
}

// ──────────────────────── EFFECT PRESETS ────────────────────────

// Amber/orange muzzle-flash palette (#f59e0b, #f97316, #fb923c).
const MUZZLE_COLORS = [
  { r: 245, g: 158, b: 11 },
  { r: 249, g: 115, b: 22 },
  { r: 251, g: 146, b: 60 },
];

/**
 * Shared emitter for a radial "burst" of particles at (x, y).
 *
 * All effects below reuse this so the acquire/spawn bookkeeping lives in one
 * place. Each option preserves the exact parameter range of the effect that
 * used it, so the visual result is unchanged.
 *
 * @param {object} o
 * @param {number} o.count      number of particles to spawn
 * @param {number} o.x          spawn anchor x
 * @param {number} o.y          spawn anchor y
 * @param {number} o.speedMin   radial speed lower bound (px/s)
 * @param {number} o.speedMax   radial speed upper bound (px/s)
 * @param {number} o.spread     random spawn jitter (±spread/2 around anchor)
 * @param {number} o.lifeMin    lifetime lower bound (s)
 * @param {number} o.lifeMax    lifetime upper bound (s)
 * @param {number} o.sizeMin    particle size lower bound
 * @param {number} o.sizeMax    particle size upper bound
 * @param {string} o.type       'circle' | 'ring' | 'smoke'
 * @param {number} o.alpha      base opacity
 * @param {number} o.drag       per-frame velocity damping
 * @param {number} o.gravity    vertical acceleration (px/s²)
 * @param {(p: object) => void} o.pickColor  sets p.r/p.g/p.b
 * @param {(angle: number, speed: number) => number} [o.vy] vertical velocity
 */
function emitBurst({
  count, x, y,
  speedMin, speedMax, spread,
  lifeMin, lifeMax,
  sizeMin, sizeMax,
  type, alpha, drag, gravity,
  pickColor,
  vy = (angle, speed) => Math.sin(angle) * speed,
}) {
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) break; // pool full — stop spawning
    const angle = Math.random() * Math.PI * 2;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    p.x = x + (Math.random() - 0.5) * spread;
    p.y = y + (Math.random() - 0.5) * spread;
    p.vx = Math.cos(angle) * speed;
    p.vy = vy(angle, speed);
    p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
    p.maxLife = p.life;
    p.size = sizeMin + Math.random() * (sizeMax - sizeMin);
    pickColor(p);
    p.a = alpha;
    p.drag = drag;
    p.gravity = gravity;
    p.type = type;
  }
}

/**
 * Water wake — blue/white particles trailing behind a moving ship.
 * Spawn at (x, y) in canvas coords.
 */
export function spawnWaterWake(x, y) {
  const count = 6 + Math.floor(Math.random() * 4);
  emitBurst({
    count, x, y,
    speedMin: 15, speedMax: 40, spread: 10,
    lifeMin: 0.6, lifeMax: 1.1, sizeMin: 2, sizeMax: 4,
    type: 'circle', alpha: 0.7, drag: 0.96, gravity: 0,
    pickColor: (p) => {
      // Light blue to white
      p.r = 140 + Math.floor(Math.random() * 80);
      p.g = 200 + Math.floor(Math.random() * 55);
      p.b = 240 + Math.floor(Math.random() * 15);
    },
  });
}

/**
 * Cannon impact — shrapnel + smoke puff at (x, y).
 */
export function spawnCannonImpact(x, y) {
  // Shrapnel — orange/yellow fast particles
  emitBurst({
    count: 10, x, y,
    speedMin: 40, speedMax: 120, spread: 6,
    lifeMin: 0.3, lifeMax: 0.7, sizeMin: 1.5, sizeMax: 3.5,
    type: 'circle', alpha: 0.9, drag: 0.93, gravity: 30,
    pickColor: (p) => {
      p.r = 255;
      p.g = 150 + Math.floor(Math.random() * 100);
      p.b = 20 + Math.floor(Math.random() * 40);
    },
  });

  // Smoke — grey expanding puffs
  emitBurst({
    count: 5, x, y,
    speedMin: 10, speedMax: 30, spread: 12,
    lifeMin: 0.5, lifeMax: 1.0, sizeMin: 3, sizeMax: 6,
    type: 'smoke', alpha: 0.5, drag: 0.95, gravity: -10,
    vy: (angle, speed) => Math.sin(angle) * speed - 10, // slight upward drift
    pickColor: (p) => {
      const grey = 100 + Math.floor(Math.random() * 60);
      p.r = grey;
      p.g = grey;
      p.b = grey;
    },
  });
}

/**
 * Ship explosion — large burst of fire, shrapnel, and smoke.
 * More particles and longer duration than the basic sprite flash.
 */
export function spawnShipExplosion(x, y) {
  // Fire core — red/orange burst
  emitBurst({
    count: 20, x, y,
    speedMin: 30, speedMax: 130, spread: 8,
    lifeMin: 0.4, lifeMax: 1.0, sizeMin: 2, sizeMax: 5,
    type: 'circle', alpha: 1.0, drag: 0.94, gravity: 20,
    pickColor: (p) => {
      p.r = 255;
      p.g = 80 + Math.floor(Math.random() * 120);
      p.b = 10 + Math.floor(Math.random() * 30);
    },
  });

  // Debris — brown/dark shrapnel
  emitBurst({
    count: 15, x, y,
    speedMin: 50, speedMax: 130, spread: 10,
    lifeMin: 0.6, lifeMax: 1.4, sizeMin: 1.5, sizeMax: 3.5,
    type: 'circle', alpha: 0.9, drag: 0.96, gravity: 50,
    pickColor: (p) => {
      p.r = 100 + Math.floor(Math.random() * 60);
      p.g = 60 + Math.floor(Math.random() * 40);
      p.b = 20 + Math.floor(Math.random() * 30);
    },
  });

  // Smoke column — rising grey puffs
  emitBurst({
    count: 8, x, y,
    speedMin: 5, speedMax: 20, spread: 16,
    lifeMin: 0.8, lifeMax: 1.5, sizeMin: 4, sizeMax: 8,
    type: 'smoke', alpha: 0.6, drag: 0.97, gravity: -15,
    vy: () => -20 - Math.random() * 30, // upward
    pickColor: (p) => {
      const grey = 80 + Math.floor(Math.random() * 60);
      p.r = grey;
      p.g = grey;
      p.b = grey;
    },
  });
}

/**
 * Water ripple — subtle expanding ring on an ocean hex at (x, y).
 */
export function spawnWaterRipple(x, y) {
  emitBurst({
    count: 2, x, y,
    speedMin: 0, speedMax: 0, spread: 20,
    lifeMin: 1.5, lifeMax: 2.5, sizeMin: 4, sizeMax: 7,
    type: 'ring', alpha: 0.25, drag: 1, gravity: 0,
    pickColor: (p) => {
      p.r = 100;
      p.g = 160;
      p.b = 220;
    },
  });
}

/**
 * Cannon muzzle flash — orange burst of particles at the attacker's hex.
 * 12 particles, radial spread, ~400ms life, alpha fade 1.0→0.
 * Colors: amber/orange palette (#f59e0b, #f97316, #fb923c).
 */
export function spawnCannonMuzzleFlash(x, y) {
  emitBurst({
    count: 12, x, y,
    speedMin: 60, speedMax: 180, spread: 6,
    lifeMin: 0.3, lifeMax: 0.4, sizeMin: 2, sizeMax: 4,
    type: 'circle', alpha: 1.0, drag: 0.94, gravity: 0,
    pickColor: (p) => {
      const c = MUZZLE_COLORS[Math.floor(Math.random() * MUZZLE_COLORS.length)];
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
    },
  });
}
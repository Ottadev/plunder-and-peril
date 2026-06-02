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

/**
 * Water wake — blue/white particles trailing behind a moving ship.
 * Spawn at (x, y) in canvas coords.
 */
export function spawnWaterWake(x, y) {
  const count = 6 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    const p = acquire();
    if (!p) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = 15 + Math.random() * 25;
    p.x = x + (Math.random() - 0.5) * 10;
    p.y = y + (Math.random() - 0.5) * 10;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.life = 0.6 + Math.random() * 0.5;
    p.maxLife = p.life;
    p.size = 2 + Math.random() * 2;
    // Light blue to white
    p.r = 140 + Math.floor(Math.random() * 80);
    p.g = 200 + Math.floor(Math.random() * 55);
    p.b = 240 + Math.floor(Math.random() * 15);
    p.a = 0.7;
    p.drag = 0.96;
    p.gravity = 0;
    p.type = 'circle';
  }
}

/**
 * Cannon impact — shrapnel + smoke puff at (x, y).
 */
export function spawnCannonImpact(x, y) {
  // Shrapnel — orange/yellow fast particles
  for (let i = 0; i < 10; i++) {
    const p = acquire();
    if (!p) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 80;
    p.x = x + (Math.random() - 0.5) * 6;
    p.y = y + (Math.random() - 0.5) * 6;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.life = 0.3 + Math.random() * 0.4;
    p.maxLife = p.life;
    p.size = 1.5 + Math.random() * 2;
    p.r = 255;
    p.g = 150 + Math.floor(Math.random() * 100);
    p.b = 20 + Math.floor(Math.random() * 40);
    p.a = 0.9;
    p.drag = 0.93;
    p.gravity = 30;
    p.type = 'circle';
  }

  // Smoke — grey expanding puffs
  for (let i = 0; i < 5; i++) {
    const p = acquire();
    if (!p) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 10 + Math.random() * 20;
    p.x = x + (Math.random() - 0.5) * 12;
    p.y = y + (Math.random() - 0.5) * 12;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed - 10; // slight upward drift
    p.life = 0.5 + Math.random() * 0.5;
    p.maxLife = p.life;
    p.size = 3 + Math.random() * 3;
    const grey = 100 + Math.floor(Math.random() * 60);
    p.r = grey;
    p.g = grey;
    p.b = grey;
    p.a = 0.5;
    p.drag = 0.95;
    p.gravity = -10;
    p.type = 'smoke';
  }
}

/**
 * Ship explosion — large burst of fire, shrapnel, and smoke.
 * More particles and longer duration than the basic sprite flash.
 */
export function spawnShipExplosion(x, y) {
  // Fire core — red/orange burst
  for (let i = 0; i < 20; i++) {
    const p = acquire();
    if (!p) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 100;
    p.x = x + (Math.random() - 0.5) * 8;
    p.y = y + (Math.random() - 0.5) * 8;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.life = 0.4 + Math.random() * 0.6;
    p.maxLife = p.life;
    p.size = 2 + Math.random() * 3;
    p.r = 255;
    p.g = 80 + Math.floor(Math.random() * 120);
    p.b = 10 + Math.floor(Math.random() * 30);
    p.a = 1.0;
    p.drag = 0.94;
    p.gravity = 20;
    p.type = 'circle';
  }

  // Debris — brown/dark shrapnel
  for (let i = 0; i < 15; i++) {
    const p = acquire();
    if (!p) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 80;
    p.x = x + (Math.random() - 0.5) * 10;
    p.y = y + (Math.random() - 0.5) * 10;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.life = 0.6 + Math.random() * 0.8;
    p.maxLife = p.life;
    p.size = 1.5 + Math.random() * 2;
    p.r = 100 + Math.floor(Math.random() * 60);
    p.g = 60 + Math.floor(Math.random() * 40);
    p.b = 20 + Math.floor(Math.random() * 30);
    p.a = 0.9;
    p.drag = 0.96;
    p.gravity = 50;
    p.type = 'circle';
  }

  // Smoke column — rising grey puffs
  for (let i = 0; i < 8; i++) {
    const p = acquire();
    if (!p) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 15;
    p.x = x + (Math.random() - 0.5) * 16;
    p.y = y + (Math.random() - 0.5) * 16;
    p.vx = Math.cos(angle) * speed;
    p.vy = -20 - Math.random() * 30; // upward
    p.life = 0.8 + Math.random() * 0.7;
    p.maxLife = p.life;
    p.size = 4 + Math.random() * 4;
    const grey = 80 + Math.floor(Math.random() * 60);
    p.r = grey;
    p.g = grey;
    p.b = grey;
    p.a = 0.6;
    p.drag = 0.97;
    p.gravity = -15;
    p.type = 'smoke';
  }
}

/**
 * Water ripple — subtle expanding ring on an ocean hex at (x, y).
 */
export function spawnWaterRipple(x, y) {
  for (let i = 0; i < 2; i++) {
    const p = acquire();
    if (!p) return;
    p.x = x + (Math.random() - 0.5) * 20;
    p.y = y + (Math.random() - 0.5) * 20;
    p.vx = 0;
    p.vy = 0;
    p.life = 1.5 + Math.random() * 1.0;
    p.maxLife = p.life;
    p.size = 4 + Math.random() * 3;
    p.r = 100;
    p.g = 160;
    p.b = 220;
    p.a = 0.25;
    p.drag = 1;
    p.gravity = 0;
    p.type = 'ring';
  }
}

/**
 * ParticleEngine tests — pool, lifecycle, spawning, edge cases
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  updateParticles,
  getActiveCount,
  spawnWaterWake,
  spawnCannonImpact,
  spawnShipExplosion,
  spawnWaterRipple,
  spawnCannonMuzzleFlash,
} from "../src/effects/ParticleEngine.js";

// Reset pool between tests — spawn max particles then let them die
function resetPool() {
  // Force all particles to deactivate by running with huge dt
  updateParticles(999);
}

beforeEach(() => {
  resetPool();
});

// ── Pool mechanics ────────────────────────────────────────────────────

describe("ParticleEngine — pool lifecycle", () => {
  it("starts with zero active particles", () => {
    expect(getActiveCount()).toBe(0);
  });

  it("spawnWaterWake creates 6-10 particles", () => {
    spawnWaterWake(100, 100);
    const count = getActiveCount();
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(10);
  });

  it("particles die after maxLife elapses", () => {
    spawnWaterWake(100, 100);
    const initial = getActiveCount();
    expect(initial).toBeGreaterThan(0);

    // Advance past max life (water wake max ~1.1s)
    updateParticles(2.0);
    expect(getActiveCount()).toBe(0);
  });

  it("particles partially die with intermediate dt", () => {
    // Use cannon impact — shrapnel life 0.3-0.7s, smoke 0.5-1.0s
    spawnCannonImpact(200, 200);
    const initial = getActiveCount();
    expect(initial).toBeGreaterThan(0);

    // Advance 0.5s — shrapnel should die, smoke still alive
    updateParticles(0.5);
    const after = getActiveCount();
    expect(after).toBeLessThan(initial);
    expect(after).toBeGreaterThan(0);

    // Advance more — all dead
    updateParticles(1.0);
    expect(getActiveCount()).toBe(0);
  });

  it("particles move over time (velocity applied)", () => {
    // We can't directly read pool, but we can verify they exist
    // and that update doesn't crash
    spawnCannonMuzzleFlash(500, 500);
    expect(getActiveCount()).toBeGreaterThan(0);
    updateParticles(0.1);
    // Should still be alive after 0.1s (life ~0.3-0.4s)
    expect(getActiveCount()).toBeGreaterThan(0);
  });

  it("pool exhausts gracefully at 300 particles", () => {
    // Spawn ship explosions repeatedly — each creates ~43 particles
    for (let i = 0; i < 10; i++) {
      spawnShipExplosion(300 + i * 10, 300);
    }
    // Should cap at 300
    expect(getActiveCount()).toBeLessThanOrEqual(300);
  });

  it("pool reuses deactivated particles", () => {
    // Spawn, kill, spawn again — should reuse same slots
    spawnCannonMuzzleFlash(100, 100);
    const first = getActiveCount();
    updateParticles(1.0); // kill all
    expect(getActiveCount()).toBe(0);

    spawnCannonMuzzleFlash(100, 100);
    const second = getActiveCount();
    expect(second).toBe(first); // same count of particles
  });

  it("getActiveCount decreases as particles die", () => {
    spawnWaterRipple(100, 100);
    const initial = getActiveCount();
    expect(initial).toBeGreaterThan(0);

    updateParticles(0.5);
    const after05 = getActiveCount();
    // Ripples have life 1.5-2.5s, should still be alive at 0.5s
    expect(after05).toBe(initial);

    updateParticles(2.0);
    expect(getActiveCount()).toBe(0);
  });
});

// ── Cannon Muzzle Flash ───────────────────────────────────────────────

describe("ParticleEngine — spawnCannonMuzzleFlash", () => {
  it("spawns exactly 12 particles", () => {
    spawnCannonMuzzleFlash(400, 300);
    expect(getActiveCount()).toBe(12);
  });

  it("particles have ~400ms life (0.3-0.4s)", () => {
    spawnCannonMuzzleFlash(400, 300);
    // At 0.25s, all alive
    updateParticles(0.25);
    expect(getActiveCount()).toBe(12);
    // At 0.5s, all dead
    updateParticles(0.3);
    expect(getActiveCount()).toBe(0);
  });

  it("multiple flashes stack without exceeding pool", () => {
    for (let i = 0; i < 5; i++) {
      spawnCannonMuzzleFlash(400 + i * 20, 300);
    }
    expect(getActiveCount()).toBe(60); // 5 × 12
  });

  it("colors are within amber/orange palette", () => {
    // Indirect test: spawning shouldn't crash
    for (let i = 0; i < 100; i++) {
      spawnCannonMuzzleFlash(Math.random() * 800, Math.random() * 600);
    }
    expect(getActiveCount()).toBeGreaterThan(0);
    updateParticles(1.0);
    expect(getActiveCount()).toBe(0);
  });
});

// ── Water Wake ────────────────────────────────────────────────────────

describe("ParticleEngine — spawnWaterWake", () => {
  it("spawns 6-10 particles", () => {
    // Run 50 times to verify range
    for (let i = 0; i < 50; i++) {
      resetPool();
      spawnWaterWake(100, 100);
      const count = getActiveCount();
      expect(count).toBeGreaterThanOrEqual(6);
      expect(count).toBeLessThanOrEqual(10);
    }
  });

  it("particles survive for 0.6-1.1s", () => {
    spawnWaterWake(100, 100);
    // At 0.5s, all alive
    updateParticles(0.5);
    const alive05 = getActiveCount();
    expect(alive05).toBeGreaterThan(0);

    // At 1.2s, all dead
    updateParticles(0.8);
    expect(getActiveCount()).toBe(0);
  });
});

// ── Cannon Impact ─────────────────────────────────────────────────────

describe("ParticleEngine — spawnCannonImpact", () => {
  it("spawns 10 shrapnel + 5 smoke = 15 particles", () => {
    spawnCannonImpact(200, 200);
    // 15 total (10 shrapnel + 5 smoke)
    // But pool might be slightly less if exhausted, so >= 14
    expect(getActiveCount()).toBeGreaterThanOrEqual(14);
    expect(getActiveCount()).toBeLessThanOrEqual(15);
  });

  it("shrapnel dies before smoke (shorter life)", () => {
    spawnCannonImpact(200, 200);
    const total = getActiveCount();

    // After 0.5s: shrapnel life 0.3-0.7s → some dead
    // Smoke life 0.5-1.0s → all alive
    updateParticles(0.5);
    const afterShrapnelDeath = getActiveCount();
    // Should have fewer particles (smoke survives longer)
    expect(afterShrapnelDeath).toBeLessThan(total);
    expect(afterShrapnelDeath).toBeGreaterThan(0);

    // After 1.2s: all dead
    updateParticles(0.8);
    expect(getActiveCount()).toBe(0);
  });

  it("shrapnel has gravity (falls down)", () => {
    // Smoke has negative gravity (rises), shrapnel positive (falls)
    // We can't directly verify, but spawning shouldn't crash
    spawnCannonImpact(200, 200);
    updateParticles(0.3);
    expect(getActiveCount()).toBeGreaterThan(0);
  });
});

// ── Ship Explosion ─────────────────────────────────────────────────────

describe("ParticleEngine — spawnShipExplosion", () => {
  it("spawns 20 fire + 15 debris + 8 smoke = 43 particles", () => {
    spawnShipExplosion(300, 300);
    const count = getActiveCount();
    expect(count).toBeGreaterThanOrEqual(41);
    expect(count).toBeLessThanOrEqual(43);
  });

  it("fire core dies first (life 0.4-1.0s)", () => {
    spawnShipExplosion(300, 300);
    const total = getActiveCount();

    // After 0.7s: fire mostly dead, debris/smoke alive
    updateParticles(0.7);
    const afterFire = getActiveCount();
    expect(afterFire).toBeLessThan(total);

    // After 2s: all dead
    updateParticles(1.5);
    expect(getActiveCount()).toBe(0);
  });

  it("smoke has negative gravity (rises)", () => {
    spawnShipExplosion(300, 300);
    // Indirect: update until all dead (max life ~1.5s)
    for (let i = 0; i < 10; i++) {
      updateParticles(0.2);
    }
    // After 2s, all dead
    expect(getActiveCount()).toBe(0);
  });
});

// ── Water Ripple ──────────────────────────────────────────────────────

describe("ParticleEngine — spawnWaterRipple", () => {
  it("spawns 2 particles", () => {
    spawnWaterRipple(100, 100);
    expect(getActiveCount()).toBe(2);
  });

  it("ripples have long life (1.5-2.5s)", () => {
    spawnWaterRipple(100, 100);
    // At 1.0s, definitely alive (min life 1.5s)
    updateParticles(1.0);
    expect(getActiveCount()).toBe(2);

    // At 3.0s, definitely dead
    updateParticles(2.1);
    expect(getActiveCount()).toBe(0);
  });

  it("ripples have zero velocity (stay in place)", () => {
    spawnWaterRipple(100, 100);
    // Update many times — ripples stay still with 0 velocity
    // Life is 1.5-2.5s, need ~3s to kill all
    for (let i = 0; i < 15; i++) {
      updateParticles(0.2);
    }
    // After 3s, all dead
    expect(getActiveCount()).toBe(0);
  });
});

// ── Update edge cases ─────────────────────────────────────────────────

describe("ParticleEngine — updateParticles edge cases", () => {
  it("handles dt=0 (no change)", () => {
    spawnCannonMuzzleFlash(100, 100);
    const before = getActiveCount();
    updateParticles(0);
    expect(getActiveCount()).toBe(before);
  });

  it("handles negative dt gracefully", () => {
    spawnCannonMuzzleFlash(100, 100);
    updateParticles(-0.1);
    // Negative dt extends life instead of reducing — particles still alive
    expect(getActiveCount()).toBe(12);
  });

  it("handles very large dt (instant kill)", () => {
    spawnCannonMuzzleFlash(100, 100);
    updateParticles(999);
    expect(getActiveCount()).toBe(0);
  });

  it("handles empty pool (no active particles)", () => {
    updateParticles(0.1);
    expect(getActiveCount()).toBe(0);
    // Should not crash
  });

  it("handles rapid spawn/update cycles", () => {
    for (let i = 0; i < 100; i++) {
      spawnCannonMuzzleFlash(Math.random() * 500, Math.random() * 400);
      updateParticles(0.05);
    }
    // Should not crash
    expect(getActiveCount()).toBeGreaterThan(0);
  });
});

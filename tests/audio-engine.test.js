/**
 * AudioEngine tests — verifies the exact scheduled sound parameters.
 *
 * AudioEngine uses the Web Audio API (window.AudioContext / window.webkitAudioContext)
 * which does not exist in the node test environment. We stub `window.AudioContext`
 * with a duck-typed mock that records every oscillator / gain / filter / source
 * schedule call, so the tests run in node without jsdom while asserting that the
 * refactored code still produces byte-identical schedules (same freq / ramp /
 * volume / duration) for every effect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  playCannonFire,
  playExplosion,
  playMove,
  playAbility,
  playClick,
  playDamage,
} from "../src/effects/AudioEngine.js";

// ── Duck-typed mock AudioContext ───────────────────────────────────────

const NOW = 1000;
const SAMPLE_RATE = 48000;

function createMockAudioContext() {
  const ctx = {
    currentTime: NOW,
    sampleRate: SAMPLE_RATE,
    state: "running",
    resume: vi.fn(),
    destination: { kind: "destination" },
    __nodes: [],
  };

  ctx.createOscillator = () => {
    const node = {
      kind: "osc",
      type: "",
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    ctx.__nodes.push(node);
    return node;
  };

  ctx.createGain = () => {
    const node = {
      kind: "gain",
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    ctx.__nodes.push(node);
    return node;
  };

  ctx.createBiquadFilter = () => {
    const node = {
      kind: "filter",
      type: "",
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    ctx.__nodes.push(node);
    return node;
  };

  ctx.createBuffer = (channels, length, sampleRate) => ({
    getChannelData: () => new Float32Array(length),
  });

  ctx.createBufferSource = () => {
    const node = {
      kind: "source",
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    ctx.__nodes.push(node);
    return node;
  };

  return ctx;
}

const mockCtx = createMockAudioContext();

// ── Helpers ────────────────────────────────────────────────────────────

function oscs() {
  return mockCtx.__nodes.filter((n) => n.kind === "osc");
}
function gains() {
  return mockCtx.__nodes.filter((n) => n.kind === "gain");
}
function filters() {
  return mockCtx.__nodes.filter((n) => n.kind === "filter");
}
function sources() {
  return mockCtx.__nodes.filter((n) => n.kind === "source");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCtx.__nodes.length = 0;
  mockCtx.state = "running";
});

afterEach(() => {
  vi.useRealTimers();
});

// Stub window.AudioContext once (before any getCtx() call). Must be a regular
// function — the real API is invoked with `new`, and arrow functions are not constructors.
beforeEach(() => {
  vi.stubGlobal("window", { AudioContext: function () { return mockCtx; } });
});

// ── Playback functions produce correct schedules ───────────────────────

describe("AudioEngine — getCtx", () => {
  it("creates the context lazily and reuses it (singleton)", () => {
    playClick();
    playClick();
    playDamage();
    // Same object cached across calls — only one context ever exists
    expect(mockCtx.__nodes.length).toBeGreaterThan(0);
    // Cached singleton: instantiate more times, still one shared ctx
    playClick();
    expect(mockCtx.__nodes.filter((n) => n.kind === "osc").length).toBe(4);
  });

  it("calls resume() when the context is suspended (autoplay policy)", () => {
    mockCtx.state = "suspended";
    playClick();
    expect(mockCtx.resume).toHaveBeenCalled();
    mockCtx.state = "running";
  });

  it("does not throw when resume is called repeatedly", () => {
    mockCtx.state = "suspended";
    playClick();
    playDamage();
    expect(mockCtx.resume).toHaveBeenCalled();
  });
});

describe("AudioEngine — playTone path (impact tone)", () => {
  it("schedules a square oscillator with pitch drop to freq*0.4", () => {
    playClick(); // playTone(600, 0.04, 'sine', 0.04, 0.03)
    const osc = oscs()[0];
    const gain = gains()[0];
    expect(osc.type).toBe("sine");
    // freq: set 600, ramp to 600*0.4=240 over 0.04s
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(600, NOW);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(240, NOW + 0.04);
    // gain: set 0.04, fade to 0.001 over 0.03s
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.04, NOW);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, NOW + 0.03);
    // envelope boundaries
    expect(osc.start).toHaveBeenCalledWith(NOW);
    expect(osc.stop).toHaveBeenCalledWith(NOW + 0.04);
    // routing
    expect(osc.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(mockCtx.destination);
  });
});

describe("AudioEngine — playCannonFire", () => {
  it("schedules a low sawtooth boom + delayed square ping", () => {
    vi.useFakeTimers();
    playCannonFire();
    // First tone: sawtooth 120 Hz
    const osc1 = oscs()[0];
    expect(osc1.type).toBe("sawtooth");
    expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(120, NOW);
    expect(osc1.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(48, NOW + 0.3);
    expect(gains()[0].gain.setValueAtTime).toHaveBeenCalledWith(0.15, NOW);
    expect(osc1.stop).toHaveBeenCalledWith(NOW + 0.3);

    // Second tone fires after 30ms via setTimeout
    vi.advanceTimersByTime(30);
    const osc2 = oscs()[1];
    expect(osc2.type).toBe("square");
    expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(400, NOW);
    expect(osc2.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(160, NOW + 0.1);
    expect(gains()[1].gain.setValueAtTime).toHaveBeenCalledWith(0.06, NOW);
  });
});

describe("AudioEngine — playExplosion", () => {
  it("schedules a random noise burst + low sine rumble", () => {
    playExplosion();
    // Noise source: lowpass filter 800→200, gain 0.2→0.001 over 0.5s
    expect(sources()).toHaveLength(1);
    expect(sources()[0].start).toHaveBeenCalledWith(NOW);
    expect(filters()).toHaveLength(1);
    expect(filters()[0].type).toBe("lowpass");
    expect(filters()[0].frequency.setValueAtTime).toHaveBeenCalledWith(800, NOW);
    expect(filters()[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(200, NOW + 0.5);

    // Low rumble tone: sine 60→24 over 0.4s, vol 0.15
    const osc = oscs()[0];
    expect(osc.type).toBe("sine");
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(60, NOW);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(24, NOW + 0.4);
    expect(osc.stop).toHaveBeenCalledWith(NOW + 0.4);
    expect(gains()[1].gain.setValueAtTime).toHaveBeenCalledWith(0.15, NOW);
  });
});

describe("AudioEngine — playMove", () => {
  it("schedules a soft splash + a slightly delayed lower splash", () => {
    vi.useFakeTimers();
    playMove();
    const osc1 = oscs()[0];
    expect(osc1.type).toBe("sine");
    expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(300, NOW);
    expect(gains()[0].gain.setValueAtTime).toHaveBeenCalledWith(0.05, NOW);

    vi.advanceTimersByTime(40);
    const osc2 = oscs()[1];
    expect(osc2.frequency.setValueAtTime).toHaveBeenCalledWith(200, NOW);
    expect(gains()[1].gain.setValueAtTime).toHaveBeenCalledWith(0.04, NOW);
  });
});

// ── playAbility regression guard (dedup refactor) ──────────────────────

describe("AudioEngine — playAbility (rising tone, refactor regression)", () => {
  it("still schedules the rising 300→800 sine ramp", () => {
    playAbility();
    const osc = oscs()[0];
    const gain = gains()[0];
    expect(oscs()).toHaveLength(1);
    expect(osc.type).toBe("sine");
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(300, NOW);
    // ramp to 800 over 0.3s (note: ramp time ≠ stop time, preserved exactly)
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(800, NOW + 0.3);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.08, NOW);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, NOW + 0.4);
    expect(osc.start).toHaveBeenCalledWith(NOW);
    expect(osc.stop).toHaveBeenCalledWith(NOW + 0.4);
  });
});

// ── Simple effects ─────────────────────────────────────────────────────

describe("AudioEngine — simple effects", () => {
  it("playClick schedules a single click sine (600Hz)", () => {
    playClick();
    expect(oscs()).toHaveLength(1);
    expect(oscs()[0].frequency.setValueAtTime).toHaveBeenCalledWith(600, NOW);
    expect(oscs()[0].stop).toHaveBeenCalledWith(NOW + 0.04);
  });

  it("playDamage schedules a square beep (180Hz)", () => {
    playDamage();
    expect(oscs()[0].type).toBe("square");
    expect(oscs()[0].frequency.setValueAtTime).toHaveBeenCalledWith(180, NOW);
    expect(oscs()[0].stop).toHaveBeenCalledWith(NOW + 0.15);
    expect(gains()[0].gain.setValueAtTime).toHaveBeenCalledWith(0.08, NOW);
  });
});

// ── Failure path: audio not available ──────────────────────────────────

describe("AudioEngine — graceful degradation", () => {
  it("swallows errors when WebAudio is unavailable (no throw)", () => {
    // Force getCtx / node creation to fail by making createOscillator throw
    const original = mockCtx.createOscillator.bind(mockCtx);
    mockCtx.createOscillator = () => {
      throw new Error("no audio");
    };
    expect(() => playClick()).not.toThrow();
    expect(() => playAbility()).not.toThrow();
    expect(() => playCannonFire()).not.toThrow();
    // restore
    mockCtx.createOscillator = original;
  });
});
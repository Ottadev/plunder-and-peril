/**
 * AudioEngine — lightweight Web Audio API synth for game sound effects.
 * No external audio files needed — all sounds are synthesized from oscillators.
 *
 * Usage:
 *   import { playCannonFire, playExplosion, playMove, playAbility } from './AudioEngine.js';
 *   playCannonFire();
 */

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Schedule a single oscillator tone plus its gain/connect envelope.
 * Shared by playTone and playAbility — preserves the exact sound by taking
 * explicit ramp endpoints and timings.
 */
function scheduleTone({ freq, freqEnd, freqRampTime, duration, type, vol, decay }) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + freqRampTime);

  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

/**
 * Play a short percussive tone.
 * @param {number} freq - base frequency in Hz
 * @param {number} duration - in seconds
 * @param {string} type - oscillator type ('square','sawtooth','triangle','sine')
 * @param {number} vol - volume 0-1
 * @param {number} decay - how fast the sound fades (lower = faster decay)
 */
function playTone(freq, duration, type = 'square', vol = 0.12, decay = 0.08) {
  try {
    // Pitch drop for impact feel
    scheduleTone({ freq, freqEnd: freq * 0.4, freqRampTime: duration, duration, type, vol, decay });
  } catch { /* audio not available */ }
}

/**
 * Play a noise burst (for explosions).
 */
function playNoise(duration, vol = 0.15) {
  try {
    const ctx = getCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(ctx.currentTime);
  } catch { /* audio not available */ }
}

// ── Public API ──────────────────────────────────────────────────────────

/** Cannon fire: low boom + high metallic ping */
export function playCannonFire() {
  playTone(120, 0.3, 'sawtooth', 0.15, 0.2);
  setTimeout(() => playTone(400, 0.1, 'square', 0.06, 0.05), 30);
}

/** Ship explosion: noise burst + low rumble */
export function playExplosion() {
  playNoise(0.5, 0.2);
  playTone(60, 0.4, 'sine', 0.15, 0.3);
}

/** Ship movement: soft water splash */
export function playMove() {
  playTone(300, 0.08, 'sine', 0.05, 0.04);
  setTimeout(() => playTone(200, 0.06, 'sine', 0.04, 0.03), 40);
}

/** Ability activation: rising magical tone */
export function playAbility() {
  try {
    scheduleTone({
      freq: 300, freqEnd: 800, freqRampTime: 0.3, duration: 0.4, type: 'sine', vol: 0.08, decay: 0.4,
    });
  } catch { /* audio not available */ }
}

/** UI click feedback */
export function playClick() {
  playTone(600, 0.04, 'sine', 0.04, 0.03);
}

/** Damage taken: short painful beep */
export function playDamage() {
  playTone(180, 0.15, 'square', 0.08, 0.1);
}

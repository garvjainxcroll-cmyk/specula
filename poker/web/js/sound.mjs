// Table sounds, made with the Web Audio API (no sound files): deal, chips, check, fold,
// your turn, the win, and a soft tick in the last seconds. Mute and volume are settings.
import { prefs } from './prefs.mjs';

let ctx = null;
let master = null;
function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  return ctx;
}
// browsers only allow sound after the first tap or key press
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { const a = audio(); if (a && a.state === 'suspended') a.resume(); }, { passive: true });

function noise(a, dur) {
  const b = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource(); s.buffer = b;
  return s;
}
function env(a, g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function tone(a, freq, t, { type = 'sine', peak = 0.3, attack = 0.005, decay = 0.2 } = {}) {
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  env(a, g, t, peak, attack, decay);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + attack + decay + 0.05);
}
function burst(a, t, { freq = 3000, q = 1, peak = 0.4, decay = 0.05, type = 'bandpass', sweepTo = null } = {}) {
  const s = noise(a, decay + 0.05); const f = a.createBiquadFilter(); const g = a.createGain();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
  env(a, g, t, peak, 0.003, decay);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + decay + 0.05);
}

const SOUNDS = {
  deal: (a, t) => burst(a, t, { freq: 2600, q: 0.8, peak: 0.35, decay: 0.045 }),
  chip: (a, t) => { tone(a, 2900, t, { peak: 0.12, decay: 0.06 }); tone(a, 3600, t + 0.03, { peak: 0.1, decay: 0.05 }); burst(a, t, { freq: 5000, q: 2, peak: 0.12, decay: 0.03 }); },
  check: (a, t) => { tone(a, 150, t, { peak: 0.5, decay: 0.08 }); tone(a, 140, t + 0.11, { peak: 0.45, decay: 0.08 }); },
  fold: (a, t) => burst(a, t, { freq: 1200, q: 0.6, peak: 0.22, decay: 0.22, type: 'lowpass', sweepTo: 250 }),
  turn: (a, t) => { tone(a, 1318.5, t, { type: 'triangle', peak: 0.22, decay: 0.25 }); tone(a, 1975.5, t + 0.13, { type: 'triangle', peak: 0.2, decay: 0.35 }); },
  win: (a, t) => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(a, f, t + i * 0.09, { type: 'triangle', peak: 0.18, decay: 0.4 })),
  allin: (a, t) => { tone(a, 110, t, { type: 'sawtooth', peak: 0.08, attack: 0.08, decay: 0.5 }); tone(a, 220, t, { type: 'triangle', peak: 0.12, attack: 0.05, decay: 0.45 }); },
  tick: (a, t) => tone(a, 1800, t, { type: 'square', peak: 0.04, decay: 0.03 }),
  flip: (a, t) => burst(a, t, { freq: 1800, q: 0.7, peak: 0.3, decay: 0.07 }),
};

export function play(name, delay = 0) {
  const p = prefs();
  if (!p.sound || p.volume <= 0) return;
  const a = audio();
  if (!a || a.state !== 'running' || !SOUNDS[name]) return;
  master.gain.value = (p.volume / 100) ** 1.6;
  SOUNDS[name](a, a.currentTime + delay / 1000);
}

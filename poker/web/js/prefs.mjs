// Player preferences: sound, volume, animations, card style, felt, layout, auto-muck, the
// session reminder, and the Small Bet / Big Bet sizes. Kept in this browser and, for a
// signed-in player, saved to their account so they follow them to another device.
import { store } from './ui.mjs';
import { send } from './net.mjs';
import { DEFAULT_PRESETS, cleanPresets } from '../src/engine/presets.mjs';

const narrow = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
const DEFAULTS = { sound: true, volume: 70, animations: 'normal', cardStyle: 'two', felt: 'green', layout: narrow ? 'compact' : 'expanded', autoMuck: true, reminderMinutes: 60, confirmFold: true };

let cur = { ...DEFAULTS, ...(store('artha-prefs') || {}) };
let bets = cleanPresets(store('artha-presets') || DEFAULT_PRESETS);
const listeners = new Set();
let timer = null;
let signedIn = false;

export const prefs = () => cur;
export const presets = () => bets;
export function onPrefs(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) { try { fn(cur); } catch (e) { console.warn(e); } } }

export function applyPrefs() {
  if (typeof document === 'undefined') return;
  const b = document.body.classList;
  b.toggle('four', cur.cardStyle === 'four');
  b.toggle('anim-off', cur.animations === 'off');
  b.toggle('anim-fast', cur.animations === 'fast');
}
function syncSoon() {
  if (!signedIn) return;
  clearTimeout(timer);
  timer = setTimeout(() => send('me/settings', { prefs: cur, presets: bets }), 700);
}
export function setPrefs(patch) { cur = { ...cur, ...patch }; store('artha-prefs', cur); applyPrefs(); emit(); syncSoon(); }
export function setPresets(p) { bets = cleanPresets(p); store('artha-presets', bets); emit(); syncSoon(); }

/** After sign-in: the account's saved preferences win. */
export function adoptAccount(me) {
  signedIn = !!me;
  if (!me) return;
  if (me.prefs) cur = { ...cur, ...me.prefs, layout: me.prefs.layout || cur.layout };
  if (me.presets) bets = cleanPresets(me.presets);
  store('artha-prefs', cur); store('artha-presets', bets);
  applyPrefs(); emit();
}

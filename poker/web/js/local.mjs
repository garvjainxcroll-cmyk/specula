// Offline practice: when this copy of the site has no live server ("single device"), practice
// runs entirely in the browser with the same table code the server uses. Opponents are bots
// and are always labelled as such. Cards are shuffled with the browser's secure generator.
// It has the same connection interface as remoteRoom() in net.mjs.
import { createRoom, sit, addBot, tick, playerAct, leave, sitOut, topUp, playerShow, setAutoMuck, setConfig, setPaused, removeBot } from '../src/room/room.mjs';
import { viewRoom } from '../src/room/view.mjs';
import { fromUint32 } from '../src/engine/rng.mjs';
import { store } from './ui.mjs';

const rng = fromUint32(() => crypto.getRandomValues(new Uint32Array(1))[0]);
const KEY = 'artha-local-practice';
const ME = 'local-you';

export function hasLocal() { return !!store(KEY); }

export function newLocalPractice({ name = 'You', avatar = null, seats = 6, bots = 5, level = 'medium', sb = 10, bb = 20, stack = 2000, actionSeconds = 30 } = {}) {
  const now = Date.now();
  const room = createRoom({ id: 'local', code: 'LOCAL', kind: 'practice', name: 'Practice (this device)', isPrivate: true, owner: ME, ownerName: name, cfg: { sb, bb, seats, minBuyIn: Math.min(stack, 20 * bb), maxBuyIn: stack, actionSeconds, botLevel: level } }, now);
  sit(room, { acct: ME, name, avatar, stack }, now);
  for (let i = 0; i < Math.min(bots, seats - 1); i++) addBot(room, { level, id: `bot-${i}` }, now, rng);
  store(KEY, room);
  return room;
}

export function localRoom(onView) {
  let room = store(KEY);
  let stopped = false;
  const show = () => { if (!stopped && room) onView(viewRoom(room, { acct: ME }, Date.now())); };
  const save = () => { room.outbox.length = 0; store(KEY, room); };
  const run = (fn) => {
    try { const out = fn(room, Date.now()); if (room) { tick(room, Date.now(), rng); save(); show(); } return { ok: true, ...(out && typeof out === 'object' && 'pending' in out ? out : {}) }; } catch (e) { return { ok: false, refused: true, code: e.code, error: e.message }; }
  };
  const timer = setInterval(() => { if (room && tick(room, Date.now(), rng)) { save(); show(); } }, 300);
  setTimeout(show, 0);
  return {
    local: true,
    get id() { return 'local'; },
    get view() { return room ? viewRoom(room, { acct: ME }, Date.now()) : null; },
    ready: Promise.resolve(),
    refresh: show,
    stop() { stopped = true; clearInterval(timer); },
    act: (handId, seq, type, to) => run((r, now) => playerAct(r, ME, { handId, seq, type, to }, now, rng)),
    sit: (seat, buyIn) => run((r, now) => sit(r, { acct: ME, name: r.ownerName, stack: buyIn || r.cfg.maxBuyIn, seat }, now)),
    leave: () => run((r, now) => leave(r, ME, now, rng)),
    sitOut: (on) => run((r, now) => sitOut(r, ME, on, now)),
    topUp: (amount) => run((r, now) => topUp(r, ME, amount, now)),
    show: () => run((r, now) => playerShow(r, ME, now)),
    autoMuck: (on) => run((r) => setAutoMuck(r, ME, on)),
    register: async () => ({ ok: false, error: 'No tournaments offline' }),
    unregister: async () => ({ ok: false }),
    manage: (op, args = {}) => run((r, now) => {
      if (op === 'config') return setConfig(r, args.cfg || {}, now);
      if (op === 'pause') return setPaused(r, true, now);
      if (op === 'resume') return setPaused(r, false, now);
      if (op === 'bot-add') { for (let i = 0; i < (args.count || 1); i++) addBot(r, { level: args.level || r.cfg.botLevel, id: `bot-${Math.floor(rng.float() * 1e9)}` }, now, rng); return null; }
      if (op === 'bot-remove') return removeBot(r, args.acct, now, rng);
      if (op === 'close') { store(KEY, null); room = null; return null; }
      throw Object.assign(new Error('Not available offline'), { code: 'offline' });
    }),
  };
}
export function clearLocal() { store(KEY, null); }

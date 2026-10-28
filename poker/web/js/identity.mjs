// "Who are you?": a quick guest name, or sign in. Used wherever playing needs an account.
import { h, mount, sheet, avatar, AVATAR_GLYPHS, AVATAR_TONES, store } from './ui.mjs';
import { auth, send, session, setMe, net } from './net.mjs';

export function avatarPicker(cur, onPick) {
  let a = { glyph: cur?.glyph || 'eagle', tone: cur?.tone || 'gold' };
  const el = h('div', { class: 'stack' });
  const draw = () => mount(el,
    h('div', { class: 'avpick', role: 'radiogroup', 'aria-label': 'Picture' }, AVATAR_GLYPHS.map((g) => h('button', { type: 'button', class: g === a.glyph ? 'on' : '', 'aria-label': g, 'aria-checked': g === a.glyph ? 'true' : 'false', role: 'radio', onclick: () => { a = { ...a, glyph: g }; draw(); onPick(a); } }, avatar({ glyph: g, tone: a.tone }, { size: 'sm' })))),
    h('div', { class: 'row tight' }, h('span', { class: 'muted small' }, 'Colour'), AVATAR_TONES.map((t) => h('button', { type: 'button', class: `btn sm ${t === a.tone ? '' : 'ghost'}`, onclick: () => { a = { ...a, tone: t }; draw(); onPick(a); } }, t))));
  draw();
  return el;
}

/** Resolves with the signed-in player, asking for a guest name if needed (null if they close it). */
export function ensureSignedIn(reason = 'Choose a name to play') {
  if (session.me) return Promise.resolve(session.me);
  if (net.mode === 'single') return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    let av = { glyph: 'eagle', tone: 'gold' };
    const name = h('input', { type: 'text', maxlength: 20, placeholder: 'Your name at the table', autocomplete: 'nickname', value: store('artha-last-name') || '' });
    const err = h('div', { class: 'err' });
    const { close } = sheet(reason, (closeIt) => h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const r = await send('auth/guest', { name: name.value, avatar: av });
      if (!r.ok) { err.textContent = r.error; return; }
      auth.set(r.token); setMe(r.me); store('artha-last-name', name.value);
      done = true; closeIt(); resolve(r.me);
    } },
    h('p', { class: 'muted' }, 'Play as a guest with a name of your choice — you get 10,000 virtual chips. You can add a password later in your profile to keep the account.'),
    h('label', { class: 'field' }, h('span', {}, 'Name'), name),
    h('div', {}, h('div', { class: 'muted small', style: { marginBottom: '6px' } }, 'Picture'), avatarPicker(av, (a) => { av = a; })),
    err,
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Play as guest'), h('a', { class: 'btn ghost', href: '#/profile', onclick: () => closeIt() }, 'Sign in instead')),
    h('p', { class: 'tiny muted' }, 'Virtual chips only: no real money, no deposits, nothing to win of value.')), { onClose: () => { if (!done) resolve(null); } });
    void close;
  });
}

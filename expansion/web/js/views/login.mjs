// Sign in, or (only on a brand-new site) create the first Super Administrator.
import { h, field, text } from '../ui.mjs';
import { api, auth } from '../api.mjs';

export async function loginScreen(onDone) {
  let st = { needsSetup: false, setupCodeRequired: false };
  try { st = await api.get('setup'); } catch (e) { /* shown below */ }
  const msg = h('div', { class: 'note bad hidden', role: 'alert' });
  const fail = (t) => { msg.textContent = t; msg.classList.remove('hidden'); };
  if (st.needsSetup) {
    const code = h('input', { type: 'password', autocomplete: 'off' });
    const name = text('', { placeholder: 'e.g. Event Head' });
    const user = h('input', { type: 'text', autocomplete: 'username', placeholder: 'e.g. eventhead' });
    const pass = h('input', { type: 'password', autocomplete: 'new-password' });
    const pass2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const go = async (e) => {
      e.preventDefault();
      if (pass.value !== pass2.value) return fail('The two passwords do not match.');
      try {
        const r = await api.post('setup', { setupCode: code.value, name: name.value, username: user.value, password: pass.value });
        auth.set(r.token); onDone();
      } catch (err) { fail(err.message); }
    };
    return h('div', { class: 'login' }, h('form', { class: 'box', onsubmit: go },
      h('img', { class: 'crest', src: 'img/crest.png', alt: 'JACO CORP crest' }),
      h('h1', {}, 'Round 4 Control'),
      h('p', { class: 'sub' }, 'First-time setup: create the Super Administrator account. This screen disappears once an account exists.'),
      st.setupCodeRequired ? field('Setup code', code, 'The code set in the site’s settings (JACO_SETUP_CODE).') : null,
      field('Your name', name), field('Username', user, '3–32 letters, numbers, dots or dashes'),
      field('Password', pass, 'At least 10 characters, with letters and a number'), field('Repeat the password', pass2),
      msg, h('button', { class: 'btn primary', type: 'submit' }, 'Create the Super Administrator')));
  }
  const user = h('input', { type: 'text', autocomplete: 'username', 'aria-label': 'Username' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Password' });
  const go = async (e) => {
    e.preventDefault();
    try { const r = await api.post('login', { username: user.value, password: pass.value }); auth.set(r.token); onDone(); }
    catch (err) { fail(err.message); pass.value = ''; pass.focus(); }
  };
  setTimeout(() => user.focus(), 30);
  return h('div', { class: 'login' }, h('form', { class: 'box', onsubmit: go },
    h('img', { class: 'crest', src: 'img/crest.png', alt: 'JACO CORP crest' }),
    h('h1', {}, 'Round 4 Control'),
    h('p', { class: 'sub' }, 'JACO CORP 2026 · CV Auction and Global Business Expansion. Event Control Team only.'),
    field('Username', user), field('Password', pass), msg,
    h('button', { class: 'btn primary', type: 'submit' }, 'Sign in'),
    h('p', { class: 'tiny muted', style: { textAlign: 'center' } }, 'Participants and judges do not use this system. Accounts are created by a Super Administrator.')));
}

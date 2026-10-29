// 14. Settings and Backup: event sessions, backups and recovery, accounts, practice tools.
import { h, card, tabs, table, pill, field, text, select, check, confirmDialog, modal, toast, when, mount } from '../ui.mjs';
import { api, auth } from '../api.mjs';

export function render(ctx) {
  const tab = ctx.sub.settings?.tab || 'sessions';
  const list = [{ id: 'sessions', label: 'Event sessions' }, { id: 'backups', label: 'Backups and recovery' }, ...(ctx.can('users.manage') ? [{ id: 'users', label: 'Accounts and permissions' }] : []), { id: 'practice', label: 'Practice tools' }, { id: 'account', label: 'My account' }];
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Control'), h('h1', { class: 'page' }, 'Settings and Backup'))),
    tabs(list, tab, (t) => ctx.go('settings', { tab: t })),
    ...({ sessions, backups, users, practice, account }[tab] || sessions)(ctx),
  ];
}

function sessions(ctx) {
  const can = ctx.can('session.manage');
  const name = text('', { placeholder: 'e.g. JACO CORP 2026 — Round 4 (official)' });
  const mode = select([['practice', 'Practice (test data)'], ['official', 'Official event']], 'practice');
  const op = async (body, ok) => { try { const r = await api.post('sessions', body); await ctx.reloadSessions(); toast(ok, 'good'); if (r.session && body.op !== 'reset' && body.op !== 'restore') await ctx.chooseSession(r.session.id); else ctx.refresh(); } catch (e) { toast(e.message, 'bad', 9000); } };
  const file = h('input', { type: 'file', accept: 'application/json,.json' });
  return [
    h('div', { class: 'note' }, 'The official session holds the real event. Practice sessions are separate documents with their own data: nothing done in a practice session can change the official one. Only one official session can be active.'),
    card('Sessions', table([
      { label: 'Session', get: (s) => s.name, render: (s) => h('div', {}, h('div', { class: 'strong' }, s.name), s.id === ctx.sid ? pill('Open now', 'gold') : null) },
      { label: 'Kind', get: (s) => s.mode, render: (s) => pill(s.mode === 'official' ? 'OFFICIAL' : 'Practice', s.mode === 'official' ? 'info' : 'warn') },
      { label: 'Created', get: (s) => s.createdAt, render: (s) => `${when(s.createdAt)} · ${s.createdBy}` },
      { label: 'Last change', get: (s) => s.updatedAt, render: (s) => (s.updatedAt ? `${when(s.updatedAt)} · ${s.updatedBy} · rev ${s.rev}` : '—') },
      { label: 'State', get: (s) => (s.archived ? 'archived' : 'active'), render: (s) => (s.archived ? pill('Archived', 'neutral') : pill('Active', 'good')) },
      { label: '', sort: false, render: (s) => h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => ctx.chooseSession(s.id) }, 'Open'),
        can ? h('button', { class: 'btn sm', onclick: async () => { const nm = await promptText('Name of the practice copy', `${s.name} — rehearsal`); if (nm) op({ op: 'duplicate', sourceId: s.id, name: nm }, 'Practice copy created.'); } }, 'Duplicate as practice') : null,
        can ? h('button', { class: 'btn sm', onclick: () => op({ op: 'archive', id: s.id, archived: !s.archived }, s.archived ? 'Restored from the archive.' : 'Archived.') }, s.archived ? 'Unarchive' : 'Archive') : null,
        can ? h('button', { class: 'btn sm', onclick: async () => { const want = s.mode === 'official' ? 'RESET OFFICIAL' : 'RESET'; const x = await confirmDialog(`Reset “${s.name}”?`, { message: 'Everything returns to the fictional sample data. A backup of the current state is taken first, and the audit log is kept.', typed: want, confirmLabel: 'Reset', danger: true }); if (x) op({ op: 'reset', id: s.id, confirmText: want }, 'Session reset (a backup was kept).'); } }, 'Reset') : null,
        can ? h('button', { class: 'btn sm danger', onclick: async () => { const x = await confirmDialog(`Delete “${s.name}”?`, { message: s.mode === 'official' ? 'The official session must be archived first. A final backup is kept.' : 'A final backup is kept and can be imported later.', typed: s.name, confirmLabel: 'Delete', danger: true }); if (x) { await op({ op: 'delete', id: s.id, confirmText: s.name }, 'Session deleted.'); if (s.id === ctx.sid) { auth.setSession(null); location.reload(); } } } }, 'Delete') : null) },
    ], ctx.sessions, { id: 'sessions', search: false, empty: 'No sessions yet.' })),
    can ? card('Create a session', [h('p', { class: 'small muted' }, 'A new session starts from the fictional sample data (four continents, twenty cities, twenty CVs, sample rules). In an official session every rule starts as a draft that Event Control must review and approve.'),
      h('div', { class: 'row' }, field('Name', name), field('Kind', mode), h('button', { class: 'btn primary', onclick: () => { if (!name.value.trim()) return toast('Give the session a name.', 'bad'); op({ op: 'create', name: name.value, mode: mode.value }, 'Session created.'); } }, 'Create'))]) : null,
    can ? card('Import a backup file as a practice session', [h('p', { class: 'small muted' }, 'Load a JSON backup downloaded from this system. It always becomes a new practice session, so it can never overwrite the official event.'),
      h('div', { class: 'row' }, file, h('button', { class: 'btn', onclick: async () => { const f = file.files[0]; if (!f) return toast('Choose a backup file first.', 'bad'); try { const d = JSON.parse(await f.text()); const nm = await promptText('Name of the new practice session', `${d.doc?.name || 'Imported'} — imported`); if (nm) op({ op: 'import', doc: d, name: nm }, 'Imported as a practice session.'); } catch { toast('That file is not a valid backup.', 'bad'); } } }, 'Import'))]) : null,
  ];
}

function promptText(title, value) {
  return new Promise((resolve) => {
    const i = text(value);
    let done = false;
    const { close } = modal(title, [i], { actions: (cl) => [h('button', { class: 'btn', onclick: cl }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { done = true; resolve(i.value.trim() || null); cl(); } }, 'OK')], onClose: () => { if (!done) resolve(null); } });
    void close;
  });
}

function backups(ctx) {
  if (!ctx.sid) return [h('div', { class: 'note' }, 'Open a session first.')];
  if (!ctx.can('backup.download')) return [h('div', { class: 'note info' }, 'Your role cannot manage backups.')];
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  const load = async () => {
    try {
      const r = await api.get(`session/${ctx.sid}/backups`);
      mount(box, table([
        { label: 'When', get: (b) => b.at, render: (b) => when(b.at) }, { label: 'By', get: (b) => b.by }, { label: 'Why', get: (b) => b.reason, wrap: true }, { label: 'Revision', num: true, get: (b) => b.rev },
        { label: '', sort: false, render: (b) => h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: async () => { try { await api.download(`session/${ctx.sid}/backup?key=${encodeURIComponent(b.key)}`); } catch (e) { toast(e.message, 'bad'); } } }, 'Download'),
          ctx.can('backup.restore') ? h('button', { class: 'btn sm danger', onclick: async () => { const x = await confirmDialog('Restore this backup?', { message: `The session returns to its state at ${when(b.at)}. The current state is backed up first and the audit log is kept.`, typed: 'RESTORE', confirmLabel: 'Restore', danger: true }); if (x) { try { await api.post(`session/${ctx.sid}/backups`, { op: 'restore', key: b.key, confirmText: 'RESTORE' }); toast('Backup restored.', 'good'); ctx.refresh(); } catch (e) { toast(e.message, 'bad', 9000); } } } }, 'Restore') : null) },
      ], r.backups, { id: 'backups', search: false, empty: 'No backups yet. Backups are taken automatically when Round 1 is locked, Round 2 is finalised or reopened, and before every reset or restore.' }));
    } catch (e) { mount(box, h('div', { class: 'note bad' }, e.message)); }
  };
  load();
  const reason = text('', { placeholder: 'Why (optional)' });
  const file = h('input', { type: 'file', accept: 'application/json,.json' });
  return [
    card('Backups of this session', [box], { tools: h('div', { class: 'row' }, reason, ctx.can('backup.create') ? h('button', { class: 'btn primary', onclick: async () => { try { await api.post(`session/${ctx.sid}/backups`, { op: 'create', reason: reason.value }); toast('Backup taken.', 'good'); load(); } catch (e) { toast(e.message, 'bad'); } } }, 'Take a backup now') : null,
      h('button', { class: 'btn', onclick: async () => { try { await api.download(`session/${ctx.sid}/backup`); } catch (e) { toast(e.message, 'bad'); } } }, 'Download the current state')) }),
    ctx.can('backup.restore') ? card('Restore from a file', [h('p', { class: 'small muted' }, 'Restore a downloaded backup into this same session (official into official, practice into practice). The current state is backed up first.'),
      h('div', { class: 'row' }, file, h('button', { class: 'btn danger', onclick: async () => { const f = file.files[0]; if (!f) return toast('Choose a file first.', 'bad'); let d; try { d = JSON.parse(await f.text()); } catch { return toast('That file is not a valid backup.', 'bad'); } const x = await confirmDialog('Restore from this file?', { typed: 'RESTORE', confirmLabel: 'Restore', danger: true }); if (x) { try { await api.post(`session/${ctx.sid}/backups`, { op: 'restore', doc: d, confirmText: 'RESTORE' }); toast('Restored from the file.', 'good'); ctx.refresh(); } catch (e) { toast(e.message, 'bad', 9000); } } } }, 'Restore'))]) : null,
    card('Recovery procedure', h('ol', { class: 'small' }, h('li', {}, 'If a laptop fails, open the site on any device and sign in: everything is stored on the server.'), h('li', {}, 'If a wrong change was saved, a Super Administrator can revert it from the Audit Log (draft edits), or restore a backup.'), h('li', {}, 'Download the complete event archive (Reports and Exports) after Round 2 is finalised and keep it safe offline.'))),
  ];
}

function users(ctx) {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  const load = async () => {
    try {
      const r = await api.get('users');
      const rows = r.users;
      mount(box, table([
        { label: 'Username', get: (u) => u.username, render: (u) => h('div', {}, h('div', { class: 'strong' }, u.username), h('div', { class: 'tiny muted' }, u.name)) },
        { label: 'Role', get: (u) => u.role, render: (u) => { const s = select(Object.entries(r.roles), u.role); s.addEventListener('change', () => change({ op: 'update', id: u.id, role: s.value })); return s; } },
        { label: 'Extra permissions (operators)', sort: false, render: (u) => (u.role === 'operator' ? h('div', { class: 'stack' }, Object.entries(r.grants).map(([g, l]) => { const c = check(l, u.grants.includes(g)); c.input.addEventListener('change', () => change({ op: 'update', id: u.id, grants: c.input.checked ? [...new Set([...u.grants, g])] : u.grants.filter((x) => x !== g) })); return c.el; })) : h('span', { class: 'muted small' }, u.role === 'super' ? 'Everything' : 'View and export only')) },
        { label: 'State', get: (u) => u.active, render: (u) => h('div', {}, pill(u.active ? 'Active' : 'Disabled', u.active ? 'good' : 'neutral'), u.lockedUntil && Date.parse(u.lockedUntil) > Date.now() ? pill('Locked out', 'bad') : null) },
        { label: 'Last sign-in', get: (u) => u.lastLoginAt, render: (u) => when(u.lastLoginAt) },
        { label: '', sort: false, render: (u) => h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => change({ op: 'update', id: u.id, active: !u.active }) }, u.active ? 'Disable' : 'Enable'),
          h('button', { class: 'btn sm', onclick: async () => { const p = await promptText(`New password for ${u.username}`, ''); if (p) change({ op: 'resetPassword', id: u.id, password: p }); } }, 'Reset password'),
          u.lockedUntil ? h('button', { class: 'btn sm', onclick: () => change({ op: 'unlock', id: u.id }) }, 'Unlock') : null,
          u.id !== ctx.me?.id ? h('button', { class: 'btn sm danger', onclick: async () => { const x = await confirmDialog(`Delete the account ${u.username}?`, { typed: u.username, confirmLabel: 'Delete', danger: true }); if (x) change({ op: 'delete', id: u.id }); } }, 'Delete') : null) },
      ], rows, { id: 'users', search: false }));
    } catch (e) { mount(box, h('div', { class: 'note bad' }, e.message)); }
  };
  const change = async (body) => { try { await api.post('users', body); toast('Account updated.', 'good'); load(); } catch (e) { toast(e.message, 'bad', 8000); } };
  load();
  const un = text(''); const nm = text(''); const pw = h('input', { type: 'password', autocomplete: 'new-password' });
  const role = select([['operator', 'Event Operator'], ['viewer', 'Read-only Control Officer'], ['super', 'Super Administrator']], 'operator');
  return [
    h('div', { class: 'note' }, 'Accounts are for the Event Control Team only. Super Administrator: everything. Event Operator: records the auction, deployments and compliance, runs calculations and exports; cannot change formulas, lock or finalise unless given extra permissions. Read-only Control Officer: inspects, verifies and exports; changes nothing. Participants and judges never get an account.'),
    card('Accounts', box),
    card('Add an account', h('div', { class: 'row' }, field('Username', un), field('Name', nm), field('Role', role), field('First password', pw, 'At least 10 characters, letters and a number'),
      h('button', { class: 'btn primary', onclick: async () => { try { await api.post('users', { op: 'create', username: un.value, name: nm.value, role: role.value, password: pw.value, grants: [] }); toast('Account created. Give the password to the person privately.', 'good'); un.value = ''; nm.value = ''; pw.value = ''; load(); } catch (e) { toast(e.message, 'bad', 8000); } } }, 'Create account'))),
  ];
}

function practice(ctx) {
  if (!ctx.doc) return [h('div', { class: 'note' }, 'Open a session first.')];
  if (ctx.doc.mode !== 'practice') return [h('div', { class: 'note info' }, 'This is the official session. Practice tools work only in practice sessions, so test data can never reach the official event. Create or open a practice session under Event sessions.')];
  const started = ctx.doc.auction.records.some((r) => r.status !== 'available');
  return [
    h('div', { class: 'note' }, 'Fill this practice session with a made-up auction outcome and written allocations, to rehearse every screen: recording, compliance, calculation, finalisation and exports. The sample includes one pending work licence and one pending insurance record, on purpose.'),
    card('Sample data', h('div', { class: 'row' },
      h('button', { class: 'btn', disabled: started || ctx.doc.round1.status === 'locked', onclick: () => ctx.act('practice.loadSample', { stage: 'auction' }) }, '1. Load the sample auction results'),
      h('button', { class: 'btn', disabled: ctx.doc.round1.status === 'locked' || !started, onclick: () => ctx.go('auction') }, '2. Lock Round 1 on the CV Auction screen'),
      h('button', { class: 'btn', disabled: ctx.doc.round1.status !== 'locked' || ctx.doc.deployments.length > 0, onclick: () => ctx.act('practice.loadSample', { stage: 'round2' }) }, '3. Load the sample allocations'))),
    card('Start again', h('p', { class: 'small' }, 'Use Reset on the Event sessions tab to return this practice session to the sample data (a backup is kept).')),
  ];
}

function account(ctx) {
  const cur = h('input', { type: 'password', autocomplete: 'current-password' }); const nw = h('input', { type: 'password', autocomplete: 'new-password' }); const nw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  return [card('My account', [h('p', {}, `${ctx.me?.name} (${ctx.me?.username}) · ${ctx.me?.roleName}`),
    h('div', { class: 'row' }, field('Current password', cur), field('New password', nw), field('Repeat the new password', nw2),
      h('button', { class: 'btn primary', onclick: async () => { if (nw.value !== nw2.value) return toast('The new passwords do not match.', 'bad'); try { const r = await api.post('me/password', { current: cur.value, next: nw.value }); auth.set(r.token); toast('Password changed. Other devices are signed out.', 'good'); cur.value = nw.value = nw2.value = ''; } catch (e) { toast(e.message, 'bad'); } } }, 'Change password')),
    h('div', { class: 'sep' }),
    h('button', { class: 'btn', onclick: async () => { const x = await confirmDialog('Sign out on every device?', { confirmLabel: 'Sign out everywhere' }); if (x) { await api.post('logout', { everywhere: true }).catch(() => {}); auth.set(null); location.reload(); } } }, 'Sign out on every device')])];
}

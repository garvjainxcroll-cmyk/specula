// 13. Audit Log: every change — who, when, what, before and after, why. A Super Administrator
// can revert a draft edit (the revert is itself recorded).
import { h, card, select, pill, confirmDialog, when, toast, mount } from '../ui.mjs';
import { api } from '../api.mjs';

const KINDS = [['change', 'Changes'], ['scenario-change', 'Scenario changes'], ['correction', 'Corrections'], ['override', 'Administrative overrides'], ['session', 'Session events']];

export function render(ctx) {
  const st = ctx.sub.audit || {};
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading the audit log…'));
  const q = h('input', { type: 'search', placeholder: 'Search summaries, actions, records, reasons', value: st.q || '' });
  const kind = select(KINDS, st.kind || '', { empty: 'All kinds' });
  const run = () => { ctx.sub.audit = { ...st, q: q.value, kind: kind.value, offset: 0 }; load(ctx, box); };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  kind.addEventListener('change', run);
  load(ctx, box);
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Control'), h('h1', { class: 'page' }, 'Audit Log'))),
    h('div', { class: 'note' }, 'Every change to auction results, deployments, compliance records, assumptions and rankings is recorded with the operator, the time, the previous and new values and any reason. Entries cannot be edited or deleted.'),
    card(null, [h('div', { class: 'tbar' }, q, kind, h('button', { class: 'btn', onclick: run }, 'Search')), box]),
  ];
}

const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

async function load(ctx, box) {
  const st = ctx.sub.audit || {};
  const qs = new URLSearchParams({ offset: String(st.offset || 0), limit: '100' });
  if (st.q) qs.set('q', st.q);
  if (st.kind) qs.set('kind', st.kind);
  try {
    const r = await api.get(`session/${ctx.sid}/audit?${qs}`);
    const canRevert = ctx.can('audit.revert') && ctx.doc.round2.status !== 'finalised';
    mount(box,
      h('div', { class: 'small muted', style: { marginBottom: '6px' } }, `${r.total} entries · showing ${r.total ? r.offset + 1 : 0}–${Math.min(r.total, r.offset + r.entries.length)}`),
      h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['#', 'When', 'Who', 'What', 'Reason', 'Changes', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, r.entries.map((e) => h('tr', {},
          h('td', { class: 'num' }, String(e.seq)), h('td', { class: 'nowrap small' }, when(e.at)), h('td', { class: 'small' }, h('div', { class: 'strong' }, e.user?.username), h('div', { class: 'muted' }, e.user?.role)),
          h('td', { class: 'wrap' }, e.summary, h('div', { class: 'tiny muted' }, `${e.action} · ${e.target?.kind || ''} ${e.target?.id || ''}`), e.kind !== 'change' ? pill(KINDS.find((k) => k[0] === e.kind)?.[1] || e.kind, e.kind === 'override' || e.kind === 'correction' ? 'warn' : 'neutral') : null),
          h('td', { class: 'wrap small' }, e.reason || ''),
          h('td', { class: 'wrap small' }, (e.changes || []).length ? h('details', {}, h('summary', {}, `${e.changes.length} field(s)`), h('div', { class: 'stack' }, e.changes.map((c) => h('div', {}, h('span', { class: 'strong' }, c.path || '(record)'), `: ${show(c.before).slice(0, 160)} → ${show(c.after).slice(0, 160)}`)))) : '—'),
          h('td', {}, e.revertedBy ? pill(`Reverted by #${e.revertedBy}`, 'neutral') : canRevert && e.revert ? h('button', { class: 'btn sm', onclick: async () => { const x = await confirmDialog(`Revert change #${e.seq}?`, { message: e.summary, reason: 'required', confirmLabel: 'Revert' }); if (x && await ctx.act('audit.revert', { seq: e.seq, reason: x.reason })) load(ctx, box); } }, 'Revert') : null)))))),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        r.offset > 0 ? h('button', { class: 'btn sm', onclick: () => { ctx.sub.audit = { ...st, offset: Math.max(0, r.offset - 100) }; load(ctx, box); } }, 'Newer') : null,
        r.offset + r.entries.length < r.total ? h('button', { class: 'btn sm', onclick: () => { ctx.sub.audit = { ...st, offset: r.offset + 100 }; load(ctx, box); } }, 'Older') : null));
  } catch (e) { mount(box, h('div', { class: 'note bad' }, e.message)); toast(e.message, 'bad'); }
}

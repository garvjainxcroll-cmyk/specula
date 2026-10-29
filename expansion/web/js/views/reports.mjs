// 12. Reports and Exports. Files are built on the server from the stored result (official or
// draft) and checked against it, so a download always matches the database.
import { h, card, select, pill, toast, when } from '../ui.mjs';
import { api } from '../api.mjs';

const ITEMS = [
  { kind: 'auction', label: 'Round 1 auction results', formats: ['xlsx', 'pdf'], needs: false },
  { kind: 'cvs', label: 'Employee CV repository', formats: ['xlsx'], needs: false },
  { kind: 'allocation', label: 'Team employee allocation sheets', formats: ['xlsx', 'pdf'], needs: true },
  { kind: 'deployments', label: 'Round 2 deployment register', formats: ['xlsx'], needs: true },
  { kind: 'compliance', label: 'Legal compliance report', formats: ['xlsx', 'pdf'], needs: true },
  { kind: 'team', label: 'Detailed financial report for one team', formats: ['pdf', 'xlsx'], needs: true, perTeam: true },
  { kind: 'comparison', label: 'Four-team comparison report', formats: ['xlsx', 'pdf'], needs: true },
  { kind: 'rankings', label: 'Final rankings', formats: ['pdf', 'xlsx'], needs: true },
  { kind: 'archive', label: 'Complete event archive (every report, backup and audit log)', formats: ['zip'], needs: true },
  { kind: 'audit', label: 'Audit log', formats: ['xlsx', 'csv'], needs: false },
  { kind: 'config', label: 'Configuration snapshot', formats: ['xlsx', 'json'], needs: false },
  { kind: 'backup', label: 'Machine-readable JSON backup of the event data', formats: ['json'], needs: false, perm: 'backup.download' },
];

export function render(ctx) {
  const { doc, view } = ctx;
  const hasFinal = doc.finals.length > 0;
  const hasDraft = !!view.calc.draft;
  const src = select([...(hasFinal ? [['final', `Official result v${doc.finals.at(-1).version}`]] : []), ...(hasDraft ? [['draft', `Draft calculation (${view.calc.current ? 'current' : 'OUTDATED'})`]] : [])], ctx.sub.reports?.source || (hasFinal ? 'final' : 'draft'));
  src.addEventListener('change', () => ctx.go('reports', { source: src.value }));
  const team = select(doc.teams.map((t) => [t.id, t.label]), ctx.sub.reports?.team || doc.teams[0].id);
  team.addEventListener('change', () => { ctx.sub.reports = { ...(ctx.sub.reports || {}), team: team.value }; });
  const dl = async (it, f, btn) => {
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Preparing…';
    try {
      const q = new URLSearchParams({ kind: it.kind, format: f });
      if (it.needs && src.value) q.set('source', src.value);
      if (it.perTeam) q.set('team', team.value);
      const name = await api.download(`session/${ctx.sid}/export?${q}`);
      toast(`Downloaded ${name}`, 'good');
    } catch (e) { toast(e.message, 'bad', 9000); }
    finally { btn.disabled = false; btn.textContent = old; }
  };
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Stage 4 · Preserve'), h('h1', { class: 'page' }, 'Reports and Exports'))),
    h('div', { class: 'note' }, 'Exports contain no passwords, sign-in tokens or account data. Information hidden in the visibility settings is left out. Round 2 reports use a stored result: the official finalised version, or the draft calculation if it still matches the inputs. Draft PDFs carry a DRAFT watermark.'),
    card('Choose the source', h('div', { class: 'row' }, h('label', { class: 'field' }, 'Round 2 figures from', hasFinal || hasDraft ? src : h('span', { class: 'muted' }, 'No stored result yet — run the calculation first')), h('label', { class: 'field' }, 'Team (for the team report)', team),
      hasFinal ? pill(`Official v${doc.finals.at(-1).version} · ${when(doc.finals.at(-1).at)}`, 'good') : null, hasDraft ? pill(`Draft · ${when(view.calc.draft.at)}`, view.calc.current ? 'info' : 'bad') : null)),
    card('Available exports', h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Export'), h('th', {}, 'Uses'), h('th', {}, 'Download'))),
      h('tbody', {}, ITEMS.filter((it) => !it.perm || ctx.can(it.perm)).map((it) => h('tr', {}, h('td', {}, it.label), h('td', { class: 'small muted' }, it.needs ? 'Stored Round 2 result' : 'Current data'),
        h('td', {}, h('div', { class: 'row' }, it.formats.map((f) => { const b = h('button', { class: 'btn sm', disabled: it.needs && !hasFinal && !hasDraft }, f.toUpperCase()); b.addEventListener('click', () => dl(it, f, b)); return b; }))))))))),
    card('Printing', h('p', { class: 'small' }, 'Any screen can also be printed (Ctrl+P / ⌘P): navigation and buttons are left off the printout.')),
  ];
}

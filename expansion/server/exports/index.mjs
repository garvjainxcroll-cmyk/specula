// The export catalogue and dispatcher. Exports never contain passwords, tokens or
// sign-in data: they are built from the session document only, and hidden regional
// information is removed according to the visibility settings.
import { Workbook } from './xlsx.mjs';
import { zip } from './zip.mjs';
import { resolveSource, currentSource, redacted, fileTag } from './common.mjs';
import * as X from './xlsx-reports.mjs';
import * as P from './pdf-reports.mjs';
import { snapshotInputs } from '../results.mjs';
import { redactAudit } from '../view.mjs';
import { can } from '../auth.mjs';
import { refuse } from '../validators.mjs';

export const CATALOGUE = [
  { kind: 'auction', label: 'Round 1 auction results', formats: ['xlsx', 'pdf'], needs: 'current' },
  { kind: 'cvs', label: 'Employee CV repository', formats: ['xlsx'], needs: 'current' },
  { kind: 'allocation', label: 'Team employee allocation sheets', formats: ['xlsx', 'pdf'], needs: 'result' },
  { kind: 'deployments', label: 'Round 2 deployment register', formats: ['xlsx'], needs: 'result' },
  { kind: 'compliance', label: 'Legal compliance report', formats: ['xlsx', 'pdf'], needs: 'result' },
  { kind: 'team', label: 'Detailed financial report (one team)', formats: ['pdf', 'xlsx'], needs: 'result', perTeam: true },
  { kind: 'comparison', label: 'Four-team comparison report', formats: ['xlsx', 'pdf'], needs: 'result' },
  { kind: 'rankings', label: 'Final rankings', formats: ['pdf', 'xlsx'], needs: 'result' },
  { kind: 'config', label: 'Configuration snapshot', formats: ['xlsx', 'json'], needs: 'current' },
  { kind: 'audit', label: 'Audit log', formats: ['xlsx', 'csv'], needs: 'current' },
  { kind: 'backup', label: 'Machine-readable JSON backup of the event data', formats: ['json'], needs: 'current' },
  { kind: 'archive', label: 'Complete event archive (every report, the backup and the audit log)', formats: ['zip'], needs: 'result' },
];

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF = 'application/pdf';

async function one(doc, actor, kind, format, team, src) {
  const cur = src.kind === 'current' ? src : null;
  const { d, r } = redacted(src.inputs, src.res, actor);
  const base = `JACO-R4_${kind}${team ? `_Team-${team}` : ''}_${fileTag(src)}`;
  const wb = () => new Workbook({ currency: d.config.currency, title: `${d.config.event.name} — ${kind}` });
  const x = (build) => { const w = wb(); build(w); return { bytes: w.toBuffer(), name: `${base}.xlsx`, type: XLSX }; };
  switch (`${kind}.${format}`) {
    case 'auction.xlsx': return x((w) => X.auctionXlsx(w, d, r, src));
    case 'auction.pdf': return { bytes: await P.auctionPdf(d, r, src, actor), name: `${base}.pdf`, type: PDF };
    case 'cvs.xlsx': return x((w) => X.cvsXlsx(w, d, r));
    case 'allocation.xlsx': return x((w) => X.allocationXlsx(w, d, r, src));
    case 'allocation.pdf': return { bytes: await P.allocationPdf(d, r, src, actor), name: `${base}.pdf`, type: PDF };
    case 'deployments.xlsx': return x((w) => X.deploymentsXlsx(w, d, r, src));
    case 'compliance.xlsx': return x((w) => X.complianceXlsx(w, d, r, src));
    case 'compliance.pdf': return { bytes: await P.compliancePdf(d, r, src, actor), name: `${base}.pdf`, type: PDF };
    case 'team.pdf': case 'team.xlsx': {
      if (!d.teams.some((t) => t.id === team)) refuse('INVALID', 'Choose a team.');
      return format === 'pdf' ? { bytes: await P.teamPdf(d, r, src, team, actor), name: `${base}.pdf`, type: PDF } : x((w) => X.teamXlsx(w, d, r, src, team));
    }
    case 'comparison.xlsx': return x((w) => X.comparisonXlsx(w, d, r, src));
    case 'comparison.pdf': return { bytes: await P.comparisonPdf(d, r, src, actor), name: `${base}.pdf`, type: PDF };
    case 'rankings.xlsx': return x((w) => X.rankingsXlsx(w, d, r, src));
    case 'rankings.pdf': return { bytes: await P.rankingsPdf(d, r, src, actor), name: `${base}.pdf`, type: PDF };
    case 'config.xlsx': return x((w) => X.configXlsx(w, d));
    case 'config.json': return { bytes: Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), note: d.notice, configuration: snapshotInputs(d) }, null, 1)), name: `${base}.json`, type: 'application/json' };
    case 'audit.xlsx': case 'audit.csv': {
      const entries = [...(doc.audit || [])].reverse();
      const shown = actor.role === 'super' ? entries : redactAudit(entries, doc.config);
      if (format === 'csv') return { bytes: Buffer.from(X.auditCsv(shown)), name: `${base}.csv`, type: 'text/csv; charset=utf-8' };
      return x((w) => X.auditXlsx(w, d, shown));
    }
    case 'backup.json': {
      if (!can(actor, 'backup.download')) refuse('FORBIDDEN', 'No permission to download backups.', null, 403);
      return { bytes: Buffer.from(JSON.stringify({ at: new Date().toISOString(), by: actor.username, reason: 'Export', sessionId: doc.id, rev: doc.rev, doc }, null, 1)), name: `JACO-R4_backup_${doc.mode}_${doc.id}_rev${doc.rev}.json`, type: 'application/json' };
    }
    default: refuse('INVALID', `There is no ${format} export of “${kind}”.`);
  }
  return cur;
}

export async function buildExport(doc, actor, { kind, format, team, source }) {
  const item = CATALOGUE.find((c) => c.kind === kind);
  if (!item) refuse('INVALID', 'Unknown export.');
  const fmt = format || item.formats[0];
  if (!item.formats.includes(fmt)) refuse('INVALID', `${item.label} is available as ${item.formats.join(' or ')}.`);
  if (kind === 'archive') {
    let src; let note = '';
    try { src = resolveSource(doc, source); } catch (e) { src = null; note = `Round 2 reports are not included: ${e.message}`; }
    const cur = currentSource(doc);
    const files = [];
    const add = async (k, f, t = null, s = null) => { const o = await one(doc, actor, k, f, t, s); files.push({ name: o.name, data: o.bytes }); };
    await add('auction', 'xlsx', null, cur); await add('auction', 'pdf', null, cur); await add('cvs', 'xlsx', null, cur);
    await add('config', 'xlsx', null, cur); await add('config', 'json', null, cur); await add('audit', 'xlsx', null, cur); await add('audit', 'csv', null, cur);
    if (can(actor, 'backup.download')) await add('backup', 'json', null, cur);
    if (src) {
      for (const k of ['allocation', 'compliance', 'comparison', 'rankings']) for (const f of CATALOGUE.find((c) => c.kind === k).formats) await add(k, f, null, src);
      await add('deployments', 'xlsx', null, src);
      for (const t of doc.teams) { await add('team', 'pdf', t.id, src); await add('team', 'xlsx', t.id, src); }
    }
    const readme = [
      `${doc.config.event.name} — ${doc.config.event.round}`,
      `Complete event archive of session “${doc.name}” (${doc.mode}), revision ${doc.rev}.`,
      `Exported ${new Date().toISOString()} by ${actor.username} (${actor.role}).`,
      src ? `Round 2 figures: ${src.label}.` : note,
      '', doc.notice || 'Fictional simulation data.',
      '', 'Contents:', ...files.map((f) => `  ${f.name}`),
      '', 'No passwords, sign-in tokens or account data are included.',
    ].join('\r\n');
    files.unshift({ name: 'README.txt', data: readme });
    return { bytes: zip(files, new Date()), name: `JACO-R4_archive_${doc.mode}_${doc.id}_${src ? fileTag(src) : 'round1'}.zip`, type: 'application/zip' };
  }
  const src = item.needs === 'result' ? resolveSource(doc, source) : currentSource(doc);
  return one(doc, actor, kind, fmt, team, src);
}

// Builds a complete new event session from the sample (fictional) data.
// Server-only: this file is never copied into the website.
import { defaultConfig, defaultRevenueModels, standardProfile } from './defaults.mjs';
import { sampleContinents, sampleCities } from './regions.mjs';
import { sampleEmployees } from './employees.mjs';
import { sampleRules } from './rules.mjs';

export const SAMPLE_NOTICE = 'All names, organisations, places, CVs, financial assumptions, regional benefits and legal rules in this session are fictional simulation data created for JACO CORP 2026.';

export function sampleTeams() {
  const t = (id, home, hq, company) => ({ id, label: `Team ${id}`, homeContinentId: home, rev: 0, profile: { ...standardProfile(), companyName: company, hqCityId: hq, existingPresence: [] } });
  return [
    t('A', 'AST', 'AST-CRE', 'Aster Home Systems'),
    t('B', 'VES', 'VES-FAI', 'Vesper Living'),
    t('C', 'SOL', 'SOL-MER', 'Solmera Smart Homes'),
    t('D', 'CAL', 'CAL-PIN', 'Caldris Home Technologies'),
  ];
}

export function auctionRecordsFor(employees) {
  return employees.map((e, i) => ({
    employeeId: e.id, order: i + 1, startingBid: e.startingBid, currentBid: null, currentBidTeamId: null, bidLog: [],
    status: 'available', winningTeamId: null, winningBid: null, confirmed: false, confirmedBy: null, confirmedAt: null,
    notes: '', resolution: null, rev: 0,
  }));
}

/**
 * A fresh session document. Official sessions start with every rule as a draft, so Event
 * Control must review and approve them; practice sessions start with them approved.
 */
export function newSessionDoc({ id, name, mode, createdAt, createdBy }) {
  const employees = sampleEmployees();
  const rules = sampleRules().map((r) => ({ ...r, approved: mode !== 'official' }));
  return {
    id, name, mode, createdAt, createdBy, rev: 0, sampleData: true, notice: SAMPLE_NOTICE,
    config: defaultConfig(),
    standardProfile: standardProfile(),
    revenueModels: defaultRevenueModels(),
    teams: sampleTeams(),
    continents: sampleContinents(),
    cities: sampleCities(),
    employees,
    rules,
    auction: { records: auctionRecordsFor(employees), liveId: null },
    round1: { status: 'open', lockedAt: null, lockedBy: null, snapshot: null, corrections: [], unlocks: [] },
    round2: { status: 'open', submissions: {}, finalisedAt: null, reopenings: [] },
    deployments: [], depSeq: 0,
    compliance: {},
    calc: { draft: null },
    finals: [],
    configVersions: [],
    audit: [], auditSeq: 0,
  };
}

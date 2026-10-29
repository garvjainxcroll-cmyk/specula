// SAMPLE DATA — fictional legal and employment rules for the JACO CORP 2026 simulation.
// None of these is a real law. If the organisers base a rule on a real law, they must mark
// it (realLaw) and record who verified it; the validation checklist enforces this.
import { L } from './defaults.mjs';

const R = (id, title, category, description, o) => ({
  id, title, category, description, sample: true, realLaw: false, verifiedBy: '',
  continentIds: o.continents || [], cityIds: o.cities || [],
  appliesTo: { when: o.when || 'always', functions: o.functions || [], seniority: [], assignmentTypes: o.types || [], roles: [] },
  mandatory: o.mandatory !== false, blocks: !!o.blocks, satisfiableBefore: o.before !== false, evidenceRequired: !!o.evidence,
  check: o.check || { kind: 'status' },
  cost: o.cost || 0, costType: o.costType || 'oneTime', penalty: o.penalty || 0, revenueImpactPct: o.revenueImpact || 0, scorePenalty: o.score || 0,
  waivable: !!o.waivable, approved: true,
});

export function sampleRules() {
  return [
    R('GLB-01', 'Employment contract documentation', 'Employment documentation', 'A signed assignment contract must be on file for every deployment.', { blocks: false, evidence: true, penalty: L(2), score: 5 }),
    R('GLB-02', 'Working hours and leave', 'Working hours and leave', 'Working hours and annual leave must meet the destination’s rules; confirmed after arrival.', { blocks: false, before: false, penalty: L(3), score: 5 }),
    R('GLB-03', 'Social security and payroll registration', 'Social security and payroll', 'Employees working outside their own continent are registered for payroll and social security at the destination.', { when: 'international', before: false, evidence: true, cost: L(0.3), penalty: L(4), score: 5 }),

    R('AST-01', 'Asterian Skilled Work Permit', 'Work authorisation', 'Non-citizens may not start work in Asteria without a Skilled Work Permit.', { continents: ['AST'], when: 'international', blocks: true, evidence: true, cost: L(1.2), penalty: L(15), score: 20 }),
    R('AST-02', 'Minimum compensation (Asteria)', 'Minimum compensation', 'Pay must be at least 90% of the local market salary for the role.', { continents: ['AST'], check: { kind: 'minSalary', basis: 'market', pct: 90 }, penalty: L(8), score: 10 }),
    R('AST-03', 'Employee insurance (Asteria)', 'Insurance', 'Health and liability insurance is compulsory for every employee.', { continents: ['AST'], evidence: true, cost: L(0.9), costType: 'annual', penalty: L(4), revenueImpact: 10, score: 5 }),

    R('VES-01', 'Vesperan Work and Residence Permit', 'Work authorisation', 'Non-citizens need a work and residence permit before starting work in Vespera.', { continents: ['VES'], when: 'international', blocks: true, evidence: true, cost: L(1.8), penalty: L(20), score: 20 }),
    R('VES-02', 'Local partner (Fairmont and Juniper Bay)', 'Local partner', 'Foreign companies must operate through a registered local partner in Fairmont and Juniper Bay.', { continents: ['VES'], cities: ['VES-FAI', 'VES-JUN'], when: 'foreignToTeam', blocks: true, check: { kind: 'localPartner' }, waivable: true }),
    R('VES-03', 'Local employment registration', 'Local registration', 'Every employee must be registered with the local labour office within 30 days of arrival.', { continents: ['VES'], before: false, cost: L(0.4), penalty: L(3), revenueImpact: 5, score: 5 }),
    R('VES-04', 'Short-term assignment limit (Vespera)', 'Contract duration', 'Short-term business assignments may last at most three months.', { continents: ['VES'], types: ['short-term'], check: { kind: 'maxContractMonths', months: 3 }, penalty: L(6), score: 10 }),

    R('SOL-01', 'Solmeran Trade Work Visa', 'Work authorisation', 'Non-citizens need a trade work visa; intra-company transfers may be fast-tracked.', { continents: ['SOL'], when: 'international', blocks: true, evidence: true, cost: L(0.9), penalty: L(12), score: 20, waivable: true }),
    R('SOL-02', 'Data protection registration', 'Data protection', 'Technology and data roles must register with the data protection authority before handling customer data.', { continents: ['SOL'], functions: ['data'], evidence: true, cost: L(0.6), penalty: L(10), revenueImpact: 20, score: 10 }),
    R('SOL-03', 'Health and safety induction', 'Health and safety', 'Operations and supply-chain staff must complete a health and safety induction before starting.', { continents: ['SOL'], functions: ['operations', 'supplyChain'], blocks: true, check: { kind: 'trainingProvided' } }),

    R('CAL-01', 'Caldris Expatriate Work Licence', 'Work authorisation', 'Non-citizens need an expatriate work licence before starting work in Caldris.', { continents: ['CAL'], when: 'international', blocks: true, evidence: true, cost: L(2.5), penalty: L(25), score: 20 }),
    R('CAL-02', 'Regional leadership qualification', 'Qualification', 'Regional leadership assignments in Caldris require at least ten years of experience.', { continents: ['CAL'], types: ['regional-leadership'], blocks: true, check: { kind: 'minExperience', years: 10 } }),
    R('CAL-03', 'Expatriate accommodation', 'Accommodation and relocation', 'International assignees must receive at least a standard relocation and accommodation package.', { continents: ['CAL'], when: 'international', check: { kind: 'relocationPackage', min: 'standard' }, penalty: L(6), score: 10 }),
    R('CAL-04', 'Local hiring commitment', 'Local hiring', 'Foreign companies in Thornfield and Silverton must employ local staff alongside each assignee.', { continents: ['CAL'], cities: ['CAL-THO', 'CAL-SIL'], when: 'foreignToTeam', before: false, cost: L(4), costType: 'annual', penalty: L(5), score: 5 }),
    R('CAL-05', 'Market entry declaration', 'Market entry', 'Foreign companies must file a market entry declaration before operating in Caldris.', { continents: ['CAL'], when: 'foreignToTeam', evidence: true, cost: L(0.5), penalty: L(10), score: 5 }),
  ];
}

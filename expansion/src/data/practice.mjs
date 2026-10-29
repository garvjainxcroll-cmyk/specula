// SAMPLE DATA — a made-up auction outcome and written allocations, for practice sessions
// and rehearsals only. It lets the Event Control Team try every screen before the event.
import { L } from './defaults.mjs';

// team → [employeeId, winning bid in lakh]
export const PRACTICE_AUCTION = {
  A: [['E06', 14], ['E16', 16], ['E05', 12], ['E19', 6], ['E13', 3.5]],
  B: [['E01', 22], ['E03', 9], ['E11', 7.5], ['E09', 12.5], ['E18', 3]],
  C: [['E15', 21], ['E08', 9], ['E12', 6], ['E14', 11], ['E17', 4]],
  D: [['E10', 19], ['E02', 12], ['E07', 10], ['E20', 12], ['E04', 5.5]],
};

const dep = (employeeId, cityId, roleId, assignmentTypeId, salaryL, o = {}) => ({
  employeeId, cityId, roleId, assignmentTypeId,
  salary: { amount: L(salaryL), currency: 'base' }, contractMonths: o.months ?? 12, startMonth: o.start || '2027-01',
  relocationPackage: o.pkg || 'standard', trainingProvided: !!o.training, localPartner: !!o.partner, officeArranged: o.office !== false,
  timeShare: 100, responsibility: o.resp || '', businessUnit: o.unit || 'Retail', contribution: '', permitsObtained: '', notes: '',
});

// written allocations as the teams might submit them
export const PRACTICE_DEPLOYMENTS = {
  A: [
    dep('E06', 'SOL-KIN', 'supply-chain', 'fixed-term', 38),
    dep('E16', 'SOL-KIN', 'sales-lead', 'fixed-term', 42),
    dep('E05', 'SOL-KIN', 'ihrm', 'regional-leadership', 40, { pkg: 'family' }),
    dep('E19', 'AST-CRE', 'finance', 'permanent', 21, { pkg: 'none', office: false }),
    dep('E13', 'SOL-MER', 'customer', 'fixed-term', 12, { training: true }),
  ],
  B: [
    dep('E01', 'AST-AUR', 'bizdev', 'regional-leadership', 72),
    dep('E03', 'AST-AUR', 'sales-lead', 'fixed-term', 34),
    dep('E11', 'AST-CRE', 'product-dev', 'fixed-term', 32),
    dep('E09', 'VES-FAI', 'compliance', 'permanent', 44, { pkg: 'none', office: false }),
    dep('E18', 'SOL-KIN', 'supply-chain', 'specialist-project', 12, { months: 9, training: true }),
  ],
  C: [
    dep('E15', 'CAL-ROS', 'regional-gm', 'regional-leadership', 72),
    dep('E08', 'SOL-OAK', 'tech-lead', 'permanent', 26, { pkg: 'none' }),
    dep('E12', 'CAL-QUE', 'supply-chain', 'fixed-term', 22, { pkg: 'standard', training: true }),
    dep('E14', 'CAL-ROS', 'risk-manager', 'fixed-term', 40),
    dep('E17', 'CAL-ROS', 'bizdev', 'fixed-term', 14, { training: true }),
  ],
  D: [
    dep('E10', 'CAL-PIN', 'strategy-director', 'permanent', 78, { pkg: 'none', office: false }),
    dep('E02', 'VES-GLE', 'finance', 'fixed-term', 42),
    dep('E07', 'VES-GLE', 'operations', 'fixed-term', 34, { pkg: 'family' }),
    dep('E20', 'VES-JUN', 'tech-lead', 'fixed-term', 46, { pkg: 'family', partner: true, office: false }),
    dep('E04', 'VES-GLE', 'ihrm', 'fixed-term', 19, { start: '2027-02', months: 11 }),
  ],
};

/** Compliance statuses an operator might record for the practice allocations. */
export function practiceComplianceFor(dep, ruleId) {
  // one deliberately unresolved permit, one pending registration, the rest in order
  if (dep.employeeId === 'E17' && ruleId === 'CAL-01') return { status: 'pending', evidence: '' };
  if (dep.employeeId === 'E11' && ruleId === 'AST-03') return { status: 'pending', evidence: '' };
  return { status: 'compliant', evidence: `File ${dep.employeeId}-${ruleId}` };
}

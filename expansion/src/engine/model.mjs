// The vocabulary of the Round 4 model: capability keys, regional attributes, statuses,
// cost categories and the validation checklist. Pure data, shared by engine and server.

export const MODEL_VERSION = '1.1.0';

// ---------------- capabilities (all scored 1–100) ----------------
export const TECH_KEYS = ['finance', 'sales', 'hr', 'ihrm', 'legal', 'operations', 'supplyChain', 'bizDev', 'data', 'strategy'];
export const SOFT_KEYS = ['culturalAdaptability', 'leadership', 'communication', 'problemSolving', 'negotiation', 'decisionMaking', 'teamwork', 'pressure'];
// derived from the CV's facts, also 0–100
export const DERIVED_KEYS = ['experience', 'intlExperience', 'languages'];
export const CAP_KEYS = [...TECH_KEYS, ...SOFT_KEYS, ...DERIVED_KEYS];

export const CAP_LABELS = {
  finance: 'Finance and budgeting', sales: 'Sales and marketing', hr: 'HR and people management', ihrm: 'IHRM and international assignments',
  legal: 'Legal and compliance awareness', operations: 'Operations and production', supplyChain: 'Supply chain and logistics',
  bizDev: 'Business development', data: 'Data analysis', strategy: 'Strategy and planning',
  culturalAdaptability: 'Cultural adaptability', leadership: 'Leadership', communication: 'Communication', problemSolving: 'Problem solving',
  negotiation: 'Negotiation', decisionMaking: 'Decision making', teamwork: 'Teamwork', pressure: 'Adaptability under pressure',
  experience: 'Experience (years, scaled)', intlExperience: 'International assignments (scaled)', languages: 'Languages spoken (scaled)',
};

// professional functions: the ten technical areas. Roles belong to one; regions can favour one.
export const FUNCTIONS = TECH_KEYS;
export const FUNCTION_LABELS = {
  finance: 'Finance', sales: 'Sales and marketing', hr: 'Human resources', ihrm: 'International HR', legal: 'Legal and compliance',
  operations: 'Operations', supplyChain: 'Supply chain', bizDev: 'Business development', data: 'Technology and data', strategy: 'Strategy and management',
};

export const SENIORITY = ['Junior', 'Mid-level', 'Senior', 'Executive'];
export const seniorityRank = (s) => Math.max(0, SENIORITY.indexOf(s));

// capability indices the administrator can weight (CV repository, Round 1 summaries)
export const INDEX_LABELS = {
  productivity: 'Expected productivity', revenue: 'Revenue contribution potential', efficiency: 'Operating efficiency',
  leadership: 'Leadership effectiveness', crossCultural: 'Cross-cultural adjustment', complianceRisk: 'Compliance risk (higher = riskier)',
  training: 'Training requirement (higher = needs more)',
};
// indices reported as "100 − weighted score"
export const INVERTED_INDICES = ['complianceRisk', 'training'];

// ---------------- regions ----------------
// kind: score = 0–100, city adjustment adds points; rate = a percentage, city adds points;
//       mult = a multiplier, city adjustment is a % change; money = continent-only amount.
// group: used for visibility control (what operators and reports may see).
export const ATTRS = [
  { key: 'marketDemand', label: 'Market demand', kind: 'score', group: 'demand' },
  { key: 'purchasingPower', label: 'Customer purchasing power', kind: 'score', group: 'demand' },
  { key: 'growthRate', label: 'Market growth rate', kind: 'rate', unit: '% a year', group: 'demand', min: -20, max: 40 },
  { key: 'competition', label: 'Competitive intensity', kind: 'score', group: 'demand' },
  { key: 'opportunityScore', label: 'Business opportunity score', kind: 'score', group: 'demand' },
  { key: 'operatingCostMultiplier', label: 'Operating cost multiplier', kind: 'mult', group: 'costs', min: 0.2, max: 4 },
  { key: 'labourCostMultiplier', label: 'Labour cost multiplier', kind: 'mult', group: 'costs', min: 0.2, max: 4 },
  { key: 'relocationCostMultiplier', label: 'Relocation cost multiplier', kind: 'mult', group: 'costs', min: 0.2, max: 4 },
  { key: 'taxRate', label: 'Corporate tax rate', kind: 'rate', unit: '% of profit', group: 'tax', min: 0, max: 60 },
  { key: 'infrastructure', label: 'Infrastructure quality', kind: 'score', group: 'conditions' },
  { key: 'logistics', label: 'Logistics and shipping conditions', kind: 'score', group: 'conditions' },
  { key: 'talentAvailability', label: 'Talent availability', kind: 'score', group: 'conditions' },
  { key: 'culturalDifficulty', label: 'Cultural and language adaptation difficulty', kind: 'score', group: 'conditions' },
  { key: 'legalComplexity', label: 'Legal and regulatory complexity', kind: 'score', group: 'conditions' },
  { key: 'riskScore', label: 'Regional risk', kind: 'score', group: 'conditions' },
  { key: 'shippingCostPct', label: 'Shipping and logistics cost', kind: 'rate', unit: '% of revenue', group: 'costs', min: 0, max: 50 },
  // continent-only
  { key: 'employerContributionPct', label: 'Employer contributions', kind: 'rate', unit: '% of salary', group: 'tax', continentOnly: true, min: 0, max: 60 },
  { key: 'fxCostPct', label: 'Currency conversion cost', kind: 'rate', unit: '% of revenue', group: 'tax', continentOnly: true, min: 0, max: 20 },
  { key: 'partnerFeePct', label: 'Local partner fee', kind: 'rate', unit: '% of revenue', group: 'costs', continentOnly: true, min: 0, max: 60 },
  { key: 'housingAllowanceAnnual', label: 'Housing allowance (a year)', kind: 'money', group: 'costs', continentOnly: true },
  { key: 'marketEntryCost', label: 'Market-entry cost (once)', kind: 'money', group: 'costs', continentOnly: true },
];
export const ATTR = Object.fromEntries(ATTRS.map((a) => [a.key, a]));
export const CITY_MONEY = [
  { key: 'baseRevenueOpportunity', label: 'Base revenue opportunity (a year, per fully productive employee)', group: 'revenue' },
  { key: 'setupCost', label: 'Office or station setup (once)', group: 'costs' },
  { key: 'officeCostAnnual', label: 'Office and infrastructure (a year)', group: 'costs' },
];
export const VISIBILITY_GROUPS = {
  demand: 'Market demand, purchasing power, growth, competition, opportunity',
  costs: 'Cost multipliers, housing, setup, office, market entry, partner fees, shipping',
  tax: 'Tax, employer contributions, currency conversion',
  conditions: 'Infrastructure, logistics, talent, culture, legal complexity, risk',
  revenue: 'Base revenue opportunity',
  bonuses: 'Role bonuses and special scenario modifiers',
};

// ---------------- auction ----------------
export const AUCTION_STATUS = { available: 'Available', live: 'Currently being auctioned', sold: 'Sold', withdrawn: 'Withdrawn', closed: 'Auction closed (unsold)' };

// ---------------- deployments ----------------
export const PACKAGES = {
  none: { rank: 0, label: 'No relocation package' },
  standard: { rank: 1, label: 'Standard relocation' },
  enhanced: { rank: 2, label: 'Enhanced relocation' },
  family: { rank: 3, label: 'Family relocation' },
};
export const MECHANISMS = {
  sales: 'Direct sales revenue', contracts: 'New customer contracts', service: 'Software or service revenue', none: 'No direct revenue',
};
export const EFFECT_KINDS = {
  uplift: 'Revenue enabled for colleagues', saving: 'Cost savings', riskMitigation: 'Risk mitigation',
};
export const SCOPES = { city: 'Same city', continent: 'Same continent', team: 'Whole team' };
export const SAVING_CATEGORIES = { logistics: 'Shipping and logistics', opex: 'Local operating, office and housing costs', compliance: 'Compliance and documentation costs', fx: 'Currency conversion costs', tax: 'Local taxes' };

// ---------------- compliance ----------------
export const COMPLIANCE_STATUS = {
  unassessed: 'Not yet assessed', compliant: 'Compliant', pending: 'Pending documentation', noncompliant: 'Non-compliant',
  na: 'Not applicable', review: 'Administrator review required', waived: 'Waived by administrator',
};
export const MANUAL_STATUSES = ['unassessed', 'compliant', 'pending', 'noncompliant', 'na', 'review'];
export const CHECK_KINDS = {
  status: 'Recorded by the operator (documents and approvals)',
  minSalary: 'Minimum compensation (checked automatically)',
  maxContractMonths: 'Contract duration limit (checked automatically)',
  minExperience: 'Minimum years of experience (checked automatically)',
  minCapability: 'Minimum capability score (checked automatically)',
  minSeniority: 'Minimum seniority (checked automatically)',
  localPartner: 'Local partner engaged (checked automatically)',
  officeOrPartner: 'Local office or partner (checked automatically)',
  trainingProvided: 'Mandatory training provided (checked automatically)',
  relocationPackage: 'Minimum relocation or accommodation package (checked automatically)',
  assignmentTypeBan: 'Assignment type not permitted (checked automatically)',
};
export const RULE_CATEGORIES = [
  'Work authorisation', 'Assignment permit', 'Qualification', 'Employment documentation', 'Local registration', 'Minimum compensation',
  'Working hours and leave', 'Insurance', 'Health and safety', 'Social security and payroll', 'Mandatory training', 'Contract duration',
  'Local hiring', 'Local partner', 'Accommodation and relocation', 'Data protection', 'Assignment restriction', 'Market entry',
];

// ---------------- money categories ----------------
export const COST_TYPES = { oneTime: 'One-time costs', recurring: 'Recurring costs', contingent: 'Contingent costs' };
export const CATEGORIES = {
  // one-time
  relocation: { type: 'oneTime', label: 'Relocation and travel' },
  permits: { type: 'oneTime', label: 'Visa, permit and registration fees' },
  training: { type: 'oneTime', label: 'Deployment training' },
  setup: { type: 'oneTime', label: 'Office or station setup' },
  equipment: { type: 'oneTime', label: 'Equipment and deployment setup' },
  marketEntry: { type: 'oneTime', label: 'Market-entry expenditure' },
  // recurring
  salary: { type: 'recurring', label: 'Salaries' },
  employer: { type: 'recurring', label: 'Employer contributions' },
  housing: { type: 'recurring', label: 'Housing and relocation allowances' },
  opex: { type: 'recurring', label: 'Local operating expenses' },
  office: { type: 'recurring', label: 'Office and infrastructure' },
  marketing: { type: 'recurring', label: 'Marketing expenditure' },
  logistics: { type: 'recurring', label: 'Shipping and logistics' },
  partner: { type: 'recurring', label: 'Local partner fees' },
  compliance: { type: 'recurring', label: 'Insurance, legal and compliance' },
  support: { type: 'recurring', label: 'Training and employee support' },
  fx: { type: 'recurring', label: 'Currency conversion' },
  tax: { type: 'recurring', label: 'Local taxes' },
  savings: { type: 'recurring', label: 'Savings achieved by specialists' },
  // contingent
  preOperational: { type: 'contingent', label: 'Delayed deployment (pre-operational) costs' },
  documentation: { type: 'contingent', label: 'Additional documentation costs' },
  penalties: { type: 'contingent', label: 'Non-compliance penalties' },
  blockerPenalty: { type: 'contingent', label: 'Configured blocker penalties' },
  interruption: { type: 'contingent', label: 'Assignment interruption' },
  duplication: { type: 'contingent', label: 'Duplicated operational expenditure' },
};
export const REVENUE_TYPES = { direct: 'Direct revenue', enabled: 'Revenue enabled for colleagues', mitigation: 'Revenue protected by risk mitigation' };

// ---------------- validation checklist ----------------
// fixed: the severity cannot be changed (structural integrity); others the Super
// Administrator may set to blocking or warning.
export const CHECKS = {
  // configuration
  CFG_TEAMS: { stage: 'config', fixed: true, severity: 'blocking', title: 'Four teams with unique labels' },
  CFG_HOME: { stage: 'config', fixed: true, severity: 'blocking', title: 'Every team has a valid home continent' },
  CFG_HOME_UNIQUE: { stage: 'config', fixed: false, severity: 'warning', title: 'Home continents are all different' },
  CFG_HQ: { stage: 'config', fixed: true, severity: 'blocking', title: 'Headquarters city lies in the home continent' },
  CFG_CITIES: { stage: 'config', fixed: true, severity: 'blocking', title: 'Every city belongs to exactly one valid continent' },
  CFG_CITY_COUNT: { stage: 'config', fixed: false, severity: 'warning', title: 'Four continents with five cities each' },
  CFG_CVS: { stage: 'config', fixed: true, severity: 'blocking', title: 'Exactly twenty valid CVs with unique IDs' },
  CFG_WEIGHTS: { stage: 'config', fixed: true, severity: 'blocking', title: 'Weights are valid and ranking weights total 100%' },
  CFG_RANGES: { stage: 'config', fixed: true, severity: 'blocking', title: 'Multiplier ranges are valid' },
  CFG_ASSUMPTIONS: { stage: 'config', fixed: true, severity: 'blocking', title: 'Financial assumptions are complete and not negative' },
  CFG_REVENUE_MODEL: { stage: 'config', fixed: true, severity: 'blocking', title: 'Every team has a defined revenue model' },
  CFG_ROLES: { stage: 'config', fixed: true, severity: 'blocking', title: 'Job roles and assignment types are valid' },
  CFG_RULES: { stage: 'config', fixed: true, severity: 'blocking', title: 'Compliance rules are valid' },
  CFG_RULES_APPROVED: { stage: 'config', fixed: false, severity: 'blocking', title: 'Every compliance rule is approved by Event Control' },
  CFG_REAL_LAW: { stage: 'config', fixed: false, severity: 'blocking', title: 'Rules based on real law record who verified them' },
  // round 1
  R1_TEAM_SIZE: { stage: 'round1', fixed: true, severity: 'blocking', title: 'Each team has exactly the required number of employees' },
  R1_TEAM_SHORT: { stage: 'round1', fixed: true, severity: 'warning', title: 'A team goes into Round 2 short-handed (allowed by Event Control)' },
  R1_UNRESOLVED: { stage: 'round1', fixed: true, severity: 'blocking', title: 'Every CV is sold or explicitly resolved' },
  R1_UNCONFIRMED: { stage: 'round1', fixed: true, severity: 'blocking', title: 'Every sale is confirmed' },
  R1_BUDGET: { stage: 'round1', fixed: false, severity: 'warning', title: 'Teams within their acquisition budget' },
  R1_BELOW_START: { stage: 'round1', fixed: false, severity: 'warning', title: 'Winning bids at or above the starting bid' },
  // round 2
  R2_R1_LOCKED: { stage: 'round2', fixed: true, severity: 'blocking', title: 'Round 1 is locked' },
  R2_SUBMISSION: { stage: 'round2', fixed: false, severity: 'warning', title: 'Each team’s written submission is recorded as received' },
  R2_EMP_MISSING: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Every hired employee has a deployment' },
  R2_EMP_WRONG_TEAM: { stage: 'round2', fixed: true, severity: 'blocking', title: 'Every deployment uses an employee the team hired' },
  R2_INVALID_REF: { stage: 'round2', fixed: true, severity: 'blocking', title: 'Every deployment references a valid employee, city, role and type' },
  R2_OVERLAP: { stage: 'round2', fixed: true, severity: 'blocking', title: 'No employee in incompatible (overlapping) assignments' },
  R2_FIELDS: { stage: 'round2', fixed: true, severity: 'blocking', title: 'Required destination information is present' },
  R2_TYPE_RULES: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Assignment type limits (duration, seniority)' },
  R2_MAX_CITY: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Maximum employees per city' },
  R2_MAX_CONTINENT: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Maximum employees per continent' },
  R2_MIN_HOME: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Minimum employees kept in the home continent' },
  R2_SENIOR_HQ: { stage: 'round2', fixed: false, severity: 'blocking', title: 'A senior executive stays at headquarters' },
  R2_FOREIGN_LIMIT: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Number of foreign continents entered' },
  R2_SAME_CITY: { stage: 'round2', fixed: true, severity: 'blocking', title: 'At most one employee of a team in each city' },
  R2_NO_PRESENCE: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Deployment to a city with no prior presence' },
  R2_NO_SUPPORT: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Deployment with neither local office nor partner' },
  R2_SALARY_MIN: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Salary at or above the employee’s minimum acceptable salary' },
  R2_SALARY_MARKET: { stage: 'round2', fixed: false, severity: 'warning', title: 'Salary at or above the local market rate' },
  R2_UNASSESSED: { stage: 'round2', fixed: true, severity: 'blocking', title: 'Every applicable mandatory requirement is assessed' },
  R2_EVIDENCE: { stage: 'round2', fixed: false, severity: 'warning', title: 'Evidence recorded where a rule requires it' },
  R2_BLOCKED: { stage: 'round2', fixed: true, severity: 'blocking', title: 'Every blocked deployment is resolved or explicitly recorded' },
  R2_NOT_APPROVED: { stage: 'round2', fixed: false, severity: 'blocking', title: 'Every deployment is approved' },
  R2_PERIOD: { stage: 'round2', fixed: false, severity: 'warning', title: 'Deployments start inside the evaluation period' },
  R2_CONTRACT: { stage: 'round2', fixed: false, severity: 'warning', title: 'Assignments end within the employee’s contract' },
  R2_RISK: { stage: 'round2', fixed: false, severity: 'warning', title: 'Disclosed CV risk factors' },
  R2_RELOCATION: { stage: 'round2', fixed: false, severity: 'warning', title: 'Relocation package meets the employee’s stated needs' },
  R2_BUDGET: { stage: 'round2', fixed: false, severity: 'warning', title: 'Expansion costs within the expansion budget' },
  R2_CASH: { stage: 'round2', fixed: false, severity: 'warning', title: 'Cash stays positive' },
  R2_RISK_THRESHOLD: { stage: 'round2', fixed: false, severity: 'warning', title: 'Regional risk below the risk threshold' },
  R2_PROFIT_THRESHOLD: { stage: 'round2', fixed: false, severity: 'warning', title: 'Profit margin above the profitability threshold' },
  R2_NEGATIVE: { stage: 'round2', fixed: true, severity: 'blocking', title: 'No invalid or negative financial input' },
  R2_RECONCILE: { stage: 'round2', fixed: true, severity: 'blocking', title: 'Team totals reconcile with employee and city records' },
  R2_CALC: { stage: 'round2', fixed: true, severity: 'blocking', title: 'A current calculation has been run' },
};

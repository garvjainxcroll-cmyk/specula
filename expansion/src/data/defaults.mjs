// The default configuration of a new event session: every formula parameter, weight and
// rule of play. All of it is editable by the Super Administrator (Event Configuration).
// Money is in minor units (paise): L(1) = ₹1,00,000, CR(1) = ₹1,00,00,000.
// Sample values for a fictional event — review them before the official round.

export const L = (x) => Math.round(x * 1e7);
export const CR = (x) => Math.round(x * 1e9);

export function defaultRoles() {
  // weights: which capabilities make someone good at the role (normalised to sum 1).
  // drivers: which destination conditions make the role matter there (0–100 attributes;
  //   'competitionInverse' = 100 − competition, 'growthScore' = growth on a 0–100 scale).
  // mechanism + revenueFactor: direct revenue the role earns (share of the city's base
  //   opportunity at productivity 1.00). effects: what the role does for colleagues.
  return [
    { id: 'sales-lead', name: 'Country Sales Lead', function: 'sales', mechanism: 'sales', revenueFactor: 1.0, logisticsFactor: 1.0, annualBudget: 0,
      weights: { sales: 0.45, negotiation: 0.2, communication: 0.2, bizDev: 0.15 },
      drivers: { marketDemand: 0.4, purchasingPower: 0.4, growthScore: 0.2 }, effects: [] },
    { id: 'bizdev', name: 'Business Development Manager', function: 'bizDev', mechanism: 'contracts', revenueFactor: 0.95, logisticsFactor: 0.8, annualBudget: 0,
      weights: { bizDev: 0.45, negotiation: 0.25, strategy: 0.15, communication: 0.15 },
      drivers: { opportunityScore: 0.4, growthScore: 0.4, competitionInverse: 0.2 }, effects: [] },
    { id: 'customer', name: 'Customer Relations Manager', function: 'sales', mechanism: 'sales', revenueFactor: 0.6, logisticsFactor: 1.0, annualBudget: 0,
      weights: { communication: 0.3, sales: 0.25, teamwork: 0.2, problemSolving: 0.25 },
      drivers: { purchasingPower: 0.5, competition: 0.5 }, effects: [{ kind: 'uplift', scope: 'city', target: 'all', max: 0.06 }] },
    { id: 'marketing', name: 'Marketing and Brand Manager', function: 'sales', mechanism: 'sales', revenueFactor: 0.25, logisticsFactor: 1.0, annualBudget: L(12),
      weights: { sales: 0.4, communication: 0.25, data: 0.2, problemSolving: 0.15 },
      drivers: { marketDemand: 0.5, purchasingPower: 0.3, competition: 0.2 }, effects: [{ kind: 'uplift', scope: 'city', target: 'all', max: 0.3 }] },
    { id: 'tech-lead', name: 'Technology and Data Lead', function: 'data', mechanism: 'service', revenueFactor: 0.8, logisticsFactor: 0.2, annualBudget: 0,
      weights: { data: 0.5, problemSolving: 0.2, strategy: 0.15, operations: 0.15 },
      drivers: { infrastructure: 0.5, talentAvailability: 0.3, purchasingPower: 0.2 }, effects: [] },
    { id: 'product-dev', name: 'Product Development Lead', function: 'operations', mechanism: 'service', revenueFactor: 0.45, logisticsFactor: 0.5, annualBudget: 0,
      weights: { problemSolving: 0.3, data: 0.25, strategy: 0.25, sales: 0.2 },
      drivers: { growthScore: 0.4, purchasingPower: 0.3, talentAvailability: 0.3 }, effects: [{ kind: 'uplift', scope: 'city', target: 'all', max: 0.1 }] },
    { id: 'regional-gm', name: 'Regional General Manager', function: 'strategy', mechanism: 'contracts', revenueFactor: 0.3, logisticsFactor: 0.8, annualBudget: 0,
      weights: { strategy: 0.3, leadership: 0.3, decisionMaking: 0.2, bizDev: 0.2 },
      drivers: { opportunityScore: 0.4, marketDemand: 0.3, growthScore: 0.3 }, effects: [{ kind: 'uplift', scope: 'continent', target: 'all', max: 0.15 }] },
    { id: 'strategy-director', name: 'Corporate Strategy Director', function: 'strategy', mechanism: 'none', revenueFactor: 0, logisticsFactor: 0, annualBudget: 0,
      weights: { strategy: 0.4, decisionMaking: 0.25, leadership: 0.2, finance: 0.15 },
      drivers: { infrastructure: 0.5, opportunityScore: 0.5 }, effects: [{ kind: 'uplift', scope: 'team', target: 'all', max: 0.08 }] },
    { id: 'operations', name: 'Operations Manager', function: 'operations', mechanism: 'none', revenueFactor: 0, logisticsFactor: 0, annualBudget: 0,
      weights: { operations: 0.5, problemSolving: 0.2, leadership: 0.15, data: 0.15 },
      drivers: { infrastructure: 0.5, talentAvailability: 0.5 },
      effects: [{ kind: 'uplift', scope: 'city', target: 'all', max: 0.15 }, { kind: 'saving', scope: 'city', category: 'opex', max: 0.15 }] },
    { id: 'supply-chain', name: 'Supply Chain and Logistics Lead', function: 'supplyChain', mechanism: 'none', revenueFactor: 0, logisticsFactor: 0, annualBudget: 0,
      weights: { supplyChain: 0.55, operations: 0.2, data: 0.15, negotiation: 0.1 },
      drivers: { logistics: 0.7, infrastructure: 0.3 },
      effects: [{ kind: 'saving', scope: 'continent', category: 'logistics', max: 0.5 }, { kind: 'uplift', scope: 'continent', target: 'all', max: 0.12 }] },
    { id: 'finance', name: 'Finance Controller', function: 'finance', mechanism: 'none', revenueFactor: 0, logisticsFactor: 0, annualBudget: 0,
      weights: { finance: 0.55, data: 0.2, strategy: 0.15, legal: 0.1 },
      drivers: { legalComplexity: 0.4, purchasingPower: 0.3, infrastructure: 0.3 },
      effects: [{ kind: 'saving', scope: 'continent', category: 'opex', max: 0.2 }, { kind: 'saving', scope: 'continent', category: 'fx', max: 0.6 }, { kind: 'saving', scope: 'continent', category: 'tax', max: 0.4 }] },
    { id: 'ihrm', name: 'International HR and Integration Manager', function: 'ihrm', mechanism: 'none', revenueFactor: 0, logisticsFactor: 0, annualBudget: 0,
      weights: { ihrm: 0.45, hr: 0.25, culturalAdaptability: 0.15, communication: 0.15 },
      drivers: { culturalDifficulty: 0.5, legalComplexity: 0.5 },
      effects: [{ kind: 'uplift', scope: 'continent', target: 'international', max: 0.2 }, { kind: 'saving', scope: 'continent', category: 'compliance', max: 0.25 }] },
    { id: 'compliance', name: 'Legal and Compliance Officer', function: 'legal', mechanism: 'none', revenueFactor: 0, logisticsFactor: 0, annualBudget: 0,
      weights: { legal: 0.6, decisionMaking: 0.15, negotiation: 0.15, communication: 0.1 },
      drivers: { legalComplexity: 0.7, riskScore: 0.3 },
      effects: [{ kind: 'saving', scope: 'continent', category: 'compliance', max: 0.6 }, { kind: 'uplift', scope: 'continent', target: 'all', max: 0.1 }] },
    { id: 'risk-manager', name: 'Risk Manager', function: 'finance', mechanism: 'none', revenueFactor: 0, logisticsFactor: 0, annualBudget: 0,
      weights: { finance: 0.3, data: 0.25, decisionMaking: 0.25, legal: 0.2 },
      drivers: { riskScore: 0.7, legalComplexity: 0.3 },
      effects: [{ kind: 'riskMitigation', scope: 'continent', max: 0.8 }] },
  ];
}

export function defaultAssignmentTypes() {
  return [
    { id: 'permanent', name: 'Permanent international transfer', relocationFactor: 1.0, housingFactor: 0.5, maxMonths: null, minSeniority: null },
    { id: 'fixed-term', name: 'Fixed-term international assignment', relocationFactor: 0.8, housingFactor: 1.0, maxMonths: 24, minSeniority: null },
    { id: 'short-term', name: 'Short-term business assignment', relocationFactor: 0.25, housingFactor: 1.3, maxMonths: 6, minSeniority: null },
    { id: 'regional-leadership', name: 'Regional leadership assignment', relocationFactor: 1.0, housingFactor: 1.0, maxMonths: null, minSeniority: 'Senior' },
    { id: 'specialist-project', name: 'Specialist project deployment', relocationFactor: 0.5, housingFactor: 1.1, maxMonths: 9, minSeniority: null },
  ];
}

export function defaultRevenueModels() {
  // factor per revenue mechanism, and marketing spend as a share of revenue
  return [
    { id: 'standard', name: 'Standard expansion model', description: 'Equal weight to sales, contracts and service revenue.', factors: { sales: 1.0, contracts: 1.0, service: 1.0 }, marketingPctOfRevenue: 3 },
    { id: 'consumer', name: 'Consumer products', description: 'Strong retail sales; contracts and services matter less.', factors: { sales: 1.15, contracts: 0.85, service: 0.8 }, marketingPctOfRevenue: 4.5 },
    { id: 'b2b', name: 'Business-to-business services', description: 'Contracts and services earn more than retail sales.', factors: { sales: 0.8, contracts: 1.2, service: 1.15 }, marketingPctOfRevenue: 2 },
    { id: 'technology', name: 'Technology platform', description: 'Software and service revenue lead.', factors: { sales: 0.9, contracts: 1.0, service: 1.3 }, marketingPctOfRevenue: 3.5 },
  ];
}

export function defaultConfig() {
  return {
    event: { name: 'JACO CORP 2026', round: 'Round 4 — International Business Expansion', subtitle: 'Round 1: CV Auction · Round 2: Global Business Expansion' },
    currency: { code: 'INR', symbol: '₹', minor: 100, grouping: 'indian', name: 'Indian rupee' },
    period: { startYear: 2027, startMonth: 1, months: 12 },
    identicalResources: true,
    formulasLocked: false,
    auction: {
      poolSize: 20,
      teamSize: 5,
      budgetEnabled: true,
      budgetBasis: 'bids', // 'bids' = winning bids only; 'initialHiringCost' = bids + recruitment + onboarding
      budgetEnforcement: 'warn', // 'warn' = the operator must acknowledge; 'block' = the sale is refused
    },
    round1: { salaryAdjustmentPct: 0 },
    deployment: {
      maxPerCity: null, maxPerContinent: null, minHomeRetained: 0, seniorAtHQ: false,
      maxForeignContinents: null, allowSameCity: true, allowNoPresence: true, requireOfficeOrPartner: false,
      splitAssignments: false, allowedAssignmentTypes: ['permanent', 'fixed-term', 'short-term', 'regional-leadership', 'specialist-project'],
    },
    roles: defaultRoles(),
    assignmentTypes: defaultAssignmentTypes(),
    indices: {
      productivity: { problemSolving: 0.25, decisionMaking: 0.2, pressure: 0.2, teamwork: 0.15, experience: 0.2 },
      revenue: { sales: 0.35, bizDev: 0.3, negotiation: 0.2, communication: 0.15 },
      efficiency: { operations: 0.3, supplyChain: 0.25, finance: 0.25, problemSolving: 0.2 },
      leadership: { leadership: 0.4, decisionMaking: 0.25, communication: 0.2, teamwork: 0.15 },
      crossCultural: { culturalAdaptability: 0.45, intlExperience: 0.25, languages: 0.2, ihrm: 0.1 },
      complianceRisk: { legal: 0.5, decisionMaking: 0.25, ihrm: 0.25 }, // reported as 100 − this
      training: { experience: 0.5, problemSolving: 0.25, pressure: 0.25 }, // reported as 100 − this
    },
    productivity: {
      fitFloor: 40, fitFull: 85, // base productivity = (capability fit − floor) ÷ (full − floor), never below 0
      relevanceMin: 0.7, relevanceMax: 1.3, // role suitability multiplier from destination relevance 0–100
      environmentMin: 0.85, environmentMax: 1.15, envInfraWeight: 0.6, envTalentWeight: 0.4,
      functionBonusCap: 20, // regional role bonus, ± % (continent + city, capped)
      expMin: 0.85, expMax: 1.05, expYearsCap: 20, intlBonusMax: 0.05, intlAssignCap: 3,
      cultureSlope: 0.004, cultureMin: 0.8, cultureMax: 1.1, languageRelief: 20,
      trainingMissingMult: 0.85, noSupportMult: 0.92, relocationShortfallMult: 0.92,
      maxProductivity: 1.5,
    },
    revenue: {
      demandWeight: 0.5, purchasingWeight: 0.3, competitionWeight: 0.2, mdmMin: 0.5, mdmMax: 1.5,
      riskDiscountMax: 0.25,
      homeSaturationPct: 35, // direct revenue in the team's own home continent is reduced: the existing business already serves it
      sharedCredit: [1, 0.6, 0.4, 0.25, 0.15], // credit for the 1st, 2nd, 3rd… direct earner of one mechanism in one city
      continentCredit: [1, 0.9, 0.8, 0.7, 0.6], // and for the 1st, 2nd… of one mechanism in one continent (market saturation)
      upliftCap: 0.5, savingsCap: 0.5,
    },
    costs: {
      baseOpexPerEmployee: L(10), equipmentPerDeployment: L(1.5), expatSupportAnnual: L(2.4), complianceOverheadAnnual: L(4), // × legal complexity ÷ 100, per employee
      domesticRelocationFactor: 0.4,
      packageFactors: { none: 0, standard: 1, enhanced: 1.35, family: 1.8 },
      pendingDocumentationCost: L(0.25), preOperationalCostPct: 25, interruptionCost: L(3), duplicateRoleCostPct: 10,
      payBeforeDeployment: true, taxEnabled: true,
    },
    compliance: {
      statusScores: { compliant: 100, waived: 90, na: null, pending: 50, review: 40, unassessed: 0, noncompliant: 0 },
      mandatoryWeight: 2, complianceShare: 70, readinessShare: 30,
      blocker: { fixedPenalty: 0, ranking: 'flag' }, // 'flag' | 'complianceZero' | 'unranked'
    },
    opportunity: {
      weights: { marketDemand: 20, growth: 15, roleSuitability: 15, infrastructure: 10, talent: 10, opportunity: 10, productivity: 10, operatingCost: 10, competition: 10, legalComplexity: 5, relocationCost: 5, risk: 5 },
      ranges: { growthMin: -5, growthMax: 15, costMultMin: 0.6, costMultMax: 1.6, relocMultMin: 0.6, relocMultMax: 1.8 },
    },
    ranking: {
      mode: 'weighted', // 'weighted' | 'financial'
      financialMetric: 'combined', // 'combined' | 'incremental' | 'operating'
      weights: { financial: 60, deployment: 20, compliance: 15, budget: 5 },
      tieBreaks: ['operatingProfit', 'fewerViolations', 'lowerExpansionCosts', 'combined'],
      budgetMaxOverspendPct: 50,
    },
    thresholds: { profitMarginWarnPct: 0, riskWarn: 60 },
    validationSeverity: {},
    visibility: { operators: {}, reports: {}, hiddenRegions: [] }, // group → false hides it
  };
}

export function standardProfile() {
  return {
    industry: 'Smart home appliances and after-sales services',
    businessModel: 'Designs and sells connected home appliances through distributors, and earns service contracts for installation and maintenance.',
    capacity: '1,20,000 appliances a year from one assembly plant',
    startingCash: CR(25), acquisitionBudget: L(110), expansionBudget: CR(9),
    baselineRevenue: CR(60), baselineOpex: CR(52),
    workforce: '420 staff at headquarters, none abroad',
    infrastructure: 'Head office and one assembly plant in the headquarters city',
    targetMarkets: 'Urban households and property developers',
    objectives: 'Grow revenue outside the home market while keeping the expansion profitable within twelve months',
    restrictions: 'No acquisitions; expansion only through the five employees hired in Round 1',
    requirements: 'Comply with every employment and corporate requirement of each destination',
    modifiers: '',
    revenueModelId: 'standard',
    existingPresence: [],
  };
}

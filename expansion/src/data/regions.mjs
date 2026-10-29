// SAMPLE DATA — fictional continents and cities for the JACO CORP 2026 simulation.
// Every place, currency and figure here is invented. Each benefit or disadvantage listed
// is tied to a number below (shown in brackets in its text).
import { L, CR } from './defaults.mjs';

export function sampleContinents() {
  return [
    {
      id: 'AST', code: 'A', name: 'Asteria', sample: true,
      description: 'A mature, wealthy market: rich customers and excellent infrastructure, but costly people and fierce competition.',
      languages: ['Asterian', 'English'], currency: { code: 'ASD', name: 'Asterian dollar', rateToBase: 62 },
      attrs: {
        marketDemand: 62, purchasingPower: 85, growthRate: 2.5, competition: 78, opportunityScore: 55,
        operatingCostMultiplier: 1.3, labourCostMultiplier: 1.35, relocationCostMultiplier: 1.2, taxRate: 28,
        infrastructure: 88, logistics: 80, talentAvailability: 80, culturalDifficulty: 30, legalComplexity: 55, riskScore: 20,
        shippingCostPct: 4.5, employerContributionPct: 14, fxCostPct: 1, partnerFeePct: 12, housingAllowanceAnnual: L(14), marketEntryCost: L(55),
      },
      functionBonus: { finance: 10, data: 5 },
      special: { revenuePct: 0, costPct: 0, label: '', active: false },
      requirements: {
        employment: 'Non-citizens need an Asterian Skilled Work Permit before starting work.',
        protection: 'Employee insurance is compulsory; pay must be at least 90% of the local market rate.',
        permits: 'Skilled Work Permit (blocking).', qualifications: 'None beyond the permit.',
      },
      benefits: [
        { label: 'High customer purchasing power', effect: 'purchasing power 85 → higher market multiplier' },
        { label: 'Strong infrastructure', effect: 'infrastructure 88 → higher operating-environment multiplier' },
        { label: 'Skilled labour availability', effect: 'talent availability 80' },
        { label: 'Favourable for finance roles', effect: '+10% productivity for finance, +5% for data' },
      ],
      disadvantages: [
        { label: 'High labour costs', effect: 'labour cost multiplier ×1.35 (sets the local market salary)' },
        { label: 'High corporate taxes', effect: 'tax 28% of profit' },
        { label: 'Intense competition', effect: 'competitive intensity 78 → lower market multiplier' },
        { label: 'Expensive operations', effect: 'operating cost multiplier ×1.30' },
      ],
    },
    {
      id: 'VES', code: 'B', name: 'Vespera', sample: true,
      description: 'A fast-growing emerging market: cheap to operate and keen to buy, but hard to settle into and complex to hire in.',
      languages: ['Vesperan'], currency: { code: 'VSR', name: 'Vesperan real', rateToBase: 9 },
      attrs: {
        marketDemand: 70, purchasingPower: 45, growthRate: 9, competition: 40, opportunityScore: 75,
        operatingCostMultiplier: 0.75, labourCostMultiplier: 0.65, relocationCostMultiplier: 0.9, taxRate: 20,
        infrastructure: 52, logistics: 48, talentAvailability: 55, culturalDifficulty: 65, legalComplexity: 70, riskScore: 50,
        shippingCostPct: 7.5, employerContributionPct: 10, fxCostPct: 3, partnerFeePct: 10, housingAllowanceAnnual: L(6), marketEntryCost: L(35),
      },
      functionBonus: { sales: 10, bizDev: 10 },
      special: { revenuePct: 0, costPct: 0, label: '', active: false },
      requirements: {
        employment: 'Non-citizens need a Vesperan Work and Residence Permit; every employee must be registered locally within 30 days.',
        protection: 'Short-term business assignments may last at most three months.',
        permits: 'Work and Residence Permit (blocking); a local partner in Fairmont and Juniper Bay (blocking).', qualifications: 'None.',
      },
      benefits: [
        { label: 'Faster market growth', effect: 'growth 9% a year' },
        { label: 'Low operating costs', effect: 'operating cost multiplier ×0.75, labour ×0.65' },
        { label: 'Low business establishment costs', effect: 'market entry ₹35 L' },
        { label: 'Favourable for sales and business development', effect: '+10% productivity for sales and business development' },
      ],
      disadvantages: [
        { label: 'Weak infrastructure', effect: 'infrastructure 52' },
        { label: 'Difficult language adaptation', effect: 'cultural difficulty 65' },
        { label: 'Complex employment authorisation', effect: 'legal complexity 70; permit rule VES-01' },
        { label: 'Mandatory local partnerships', effect: 'rule VES-02 in Fairmont and Juniper Bay' },
        { label: 'Foreign exchange exposure', effect: 'currency conversion 3% of revenue' },
      ],
    },
    {
      id: 'SOL', code: 'C', name: 'Solmera', sample: true,
      description: 'The continent’s trade and logistics hub: superb ports and distribution, skilled people, moderate costs.',
      languages: ['Solmeric', 'English'], currency: { code: 'SOM', name: 'Solmeran mark', rateToBase: 48 },
      attrs: {
        marketDemand: 58, purchasingPower: 62, growthRate: 5, competition: 55, opportunityScore: 65,
        operatingCostMultiplier: 0.95, labourCostMultiplier: 0.9, relocationCostMultiplier: 0.95, taxRate: 22,
        infrastructure: 78, logistics: 92, talentAvailability: 72, culturalDifficulty: 40, legalComplexity: 45, riskScore: 30,
        shippingCostPct: 3, employerContributionPct: 12, fxCostPct: 1.5, partnerFeePct: 9, housingAllowanceAnnual: L(9), marketEntryCost: L(40),
      },
      functionBonus: { supplyChain: 15, operations: 10 },
      special: { revenuePct: 0, costPct: 0, label: '', active: false },
      requirements: {
        employment: 'Non-citizens need a Solmeran Trade Work Visa (intra-company transfers may be fast-tracked by Event Control).',
        protection: 'Operations and supply-chain staff must complete a health and safety induction.',
        permits: 'Trade Work Visa (blocking); data protection registration for technology and data roles.', qualifications: 'None.',
      },
      benefits: [
        { label: 'Lower shipping costs', effect: 'shipping 3% of revenue' },
        { label: 'Access to suppliers and strong distribution networks', effect: 'logistics 92' },
        { label: 'Favourable for supply chain and operations', effect: '+15% productivity for supply chain, +10% for operations' },
        { label: 'Access to neighbouring markets', effect: 'business opportunity 65' },
      ],
      disadvantages: [
        { label: 'Moderate competition', effect: 'competitive intensity 55' },
        { label: 'Data protection requirements', effect: 'rule SOL-02 for technology and data roles' },
      ],
    },
    {
      id: 'CAL', code: 'D', name: 'Caldris', sample: true,
      description: 'A resource-rich frontier: little competition and low tax, but remote, volatile and strict about who may work there.',
      languages: ['Caldric'], currency: { code: 'CLC', name: 'Caldris crown', rateToBase: 14 },
      attrs: {
        marketDemand: 66, purchasingPower: 58, growthRate: 7, competition: 30, opportunityScore: 70,
        operatingCostMultiplier: 1.1, labourCostMultiplier: 1.05, relocationCostMultiplier: 1.5, taxRate: 18,
        infrastructure: 45, logistics: 40, talentAvailability: 38, culturalDifficulty: 60, legalComplexity: 75, riskScore: 65,
        shippingCostPct: 9, employerContributionPct: 9, fxCostPct: 4, partnerFeePct: 15, housingAllowanceAnnual: L(11), marketEntryCost: L(50),
      },
      functionBonus: { legal: 10, strategy: 10, sales: -5 },
      special: { revenuePct: 0, costPct: 0, label: '', active: false },
      requirements: {
        employment: 'Non-citizens need a Caldris Expatriate Work Licence; foreign firms declare market entry; Thornfield and Silverton require local hiring.',
        protection: 'International assignees must receive at least a standard relocation and accommodation package.',
        permits: 'Expatriate Work Licence (blocking).', qualifications: 'Regional leadership assignments need at least 10 years of experience.',
      },
      benefits: [
        { label: 'Low competition', effect: 'competitive intensity 30 → higher market multiplier' },
        { label: 'Low corporate tax', effect: 'tax 18% of profit' },
        { label: 'High business opportunity', effect: 'business opportunity 70' },
        { label: 'Government grants in Thornfield', effect: 'local costs −15% in Thornfield' },
      ],
      disadvantages: [
        { label: 'Expensive relocation', effect: 'relocation cost multiplier ×1.50' },
        { label: 'Weak infrastructure and limited local talent', effect: 'infrastructure 45, talent 38' },
        { label: 'Long shipment times', effect: 'shipping 9% of revenue' },
        { label: 'Market volatility', effect: 'regional risk 65 → risk discount on revenue' },
        { label: 'Foreign exchange exposure', effect: 'currency conversion 4% of revenue' },
      ],
    },
  ];
}

const city = (id, continentId, name, description, adj, money, extra = {}) => ({
  id, continentId, name, description, sample: true, adj,
  baseRevenueOpportunity: CR(money[0]), setupCost: L(money[1]), officeCostAnnual: L(money[2]),
  functionBonus: extra.functionBonus || {}, special: extra.special || { revenuePct: 0, costPct: 0, label: '', active: false },
  benefits: extra.benefits || [], disadvantages: extra.disadvantages || [],
});

export function sampleCities() {
  return [
    city('AST-AUR', 'AST', 'Aurum City', 'Capital and financial centre of Asteria.', { marketDemand: 8, purchasingPower: 8, competition: 10, operatingCostMultiplier: 15, labourCostMultiplier: 10, infrastructure: 5, opportunityScore: 5, culturalDifficulty: -5 }, [4.9, 40, 36],
      { functionBonus: { finance: 5 }, benefits: [{ label: 'Highest purchasing power on the continent', effect: 'purchasing power +8' }], disadvantages: [{ label: 'Most expensive city', effect: 'operating costs +15%, labour +10%' }] }),
    city('AST-BEL', 'AST', 'Bellhaven', 'Deep-water port on the eastern coast.', { logistics: 10, shippingCostPct: -1, marketDemand: -4, operatingCostMultiplier: -5, competition: -5 }, [4.1, 28, 24],
      { functionBonus: { supplyChain: 10 }, benefits: [{ label: 'Lower shipping costs', effect: 'shipping −1 point' }, { label: 'Favourable for supply chain', effect: '+10% supply chain productivity' }] }),
    city('AST-CRE', 'AST', 'Crestford', 'Technology and research hub.', { talentAvailability: 12, infrastructure: 6, competition: 5, operatingCostMultiplier: 5 }, [4.3, 32, 28],
      { functionBonus: { data: 10 }, benefits: [{ label: 'Skilled labour', effect: 'talent +12' }, { label: 'Favourable for technology roles', effect: '+10% data productivity' }] }),
    city('AST-DUN', 'AST', 'Dunmere', 'Manufacturing city in the industrial north.', { operatingCostMultiplier: -15, labourCostMultiplier: -10, marketDemand: -8, purchasingPower: -10, competition: -15, logistics: 5 }, [3.5, 20, 16],
      { functionBonus: { operations: 10 }, benefits: [{ label: 'Low operating costs', effect: 'operating costs −15%' }], disadvantages: [{ label: 'Lower purchasing power', effect: 'purchasing power −10' }] }),
    city('AST-EVE', 'AST', 'Everwick', 'Small city with a regional tax-incentive zone.', { taxRate: -8, marketDemand: -10, competition: -20, operatingCostMultiplier: -10, opportunityScore: 5, talentAvailability: -10 }, [3.2, 18, 14],
      { benefits: [{ label: 'Tax incentive zone', effect: 'tax −8 points (20%)' }, { label: 'Little competition', effect: 'competition −20' }], disadvantages: [{ label: 'Small market', effect: 'demand −10' }] }),

    city('VES-FAI', 'VES', 'Fairmont', 'Capital of Vespera; seat of government.', { marketDemand: 8, purchasingPower: 12, infrastructure: 12, competition: 10, operatingCostMultiplier: 15, legalComplexity: 5 }, [4.3, 22, 18],
      { benefits: [{ label: 'Wealthiest customers in Vespera', effect: 'purchasing power +12' }], disadvantages: [{ label: 'Mandatory local partnership', effect: 'rule VES-02' }] }),
    city('VES-GLE', 'VES', 'Glenhaven', 'Special economic zone with government support.', { taxRate: -10, opportunityScore: 10, legalComplexity: -15, infrastructure: 8 }, [3.5, 15, 12],
      { special: { revenuePct: 0, costPct: -10, label: 'Glenhaven SEZ grant: local costs −10%', active: true }, benefits: [{ label: 'Tax incentive', effect: 'tax −10 points (10%)' }, { label: 'Government grant', effect: 'local costs −10%' }, { label: 'Simpler regulation', effect: 'legal complexity −15' }] }),
    city('VES-HIG', 'VES', 'Highcrest', 'Mining and heavy-industry town in the highlands.', { purchasingPower: 5, marketDemand: -5, riskScore: 10, infrastructure: -5, logistics: -5 }, [3.2, 14, 10],
      { functionBonus: { operations: 5 }, disadvantages: [{ label: 'Market volatility', effect: 'risk +10' }] }),
    city('VES-IRO', 'VES', 'Ironvale', 'Low-cost manufacturing belt.', { operatingCostMultiplier: -15, labourCostMultiplier: -15, logistics: -12, infrastructure: -8, marketDemand: -8, competition: -10 }, [3.0, 12, 9],
      { functionBonus: { supplyChain: -5 }, benefits: [{ label: 'Lowest operating costs', effect: 'operating costs −15%' }], disadvantages: [{ label: 'Long shipment times', effect: 'logistics −12' }] }),
    city('VES-JUN', 'VES', 'Juniper Bay', 'Booming coastal consumer and tourism market.', { marketDemand: 12, growthRate: 3, purchasingPower: 6, logistics: 10, competition: 5, culturalDifficulty: -10 }, [4.1, 18, 14],
      { benefits: [{ label: 'High market demand and growth', effect: 'demand +12, growth +3 points' }], disadvantages: [{ label: 'Mandatory local partnership', effect: 'rule VES-02' }] }),

    city('SOL-KIN', 'SOL', 'Kingsport', 'The largest port in the four continents.', { logistics: 6, shippingCostPct: -1, marketDemand: 6, competition: 12, operatingCostMultiplier: 10 }, [4.3, 30, 26],
      { functionBonus: { supplyChain: 5 }, benefits: [{ label: 'Major logistics opportunities', effect: 'logistics 98, shipping 2%' }], disadvantages: [{ label: 'Intense competition', effect: 'competition +12' }] }),
    city('SOL-LAR', 'SOL', 'Larkspur', 'Agricultural heartland.', { marketDemand: -8, operatingCostMultiplier: -15, labourCostMultiplier: -10, competition: -15, purchasingPower: -8, infrastructure: -10 }, [3.1, 14, 10],
      { benefits: [{ label: 'Low operating costs', effect: 'operating costs −15%' }] }),
    city('SOL-MER', 'SOL', 'Meridian', 'Trade-fair city where deals are made.', { opportunityScore: 15, growthRate: 2, marketDemand: 4 }, [3.9, 24, 20],
      { functionBonus: { bizDev: 10 }, special: { revenuePct: 5, costPct: 0, label: 'Meridian Trade Fair year: revenue +5%', active: true }, benefits: [{ label: 'Trade fair', effect: 'revenue +5%' }, { label: 'Favourable for business development', effect: '+10% business development productivity' }] }),
    city('SOL-NOR', 'SOL', 'Northbridge', 'Rail and distribution junction.', { logistics: 4, infrastructure: 6, shippingCostPct: -0.5, operatingCostMultiplier: -5 }, [3.5, 20, 16],
      { benefits: [{ label: 'Strong distribution network', effect: 'logistics 96, infrastructure 84' }] }),
    city('SOL-OAK', 'SOL', 'Oakridge', 'University town with a deep talent pool.', { talentAvailability: 18, infrastructure: 5, marketDemand: -6, purchasingPower: -4, competition: -10 }, [3.4, 18, 14],
      { functionBonus: { data: 10 }, benefits: [{ label: 'Skilled labour availability', effect: 'talent 90' }, { label: 'Favourable for technology roles', effect: '+10% data productivity' }] }),

    city('CAL-PIN', 'CAL', 'Pinehurst', 'Capital of Caldris and its best-connected city.', { infrastructure: 15, talentAvailability: 12, marketDemand: 5, purchasingPower: 6, competition: 10, legalComplexity: 5, riskScore: -10 }, [4.3, 30, 26],
      { benefits: [{ label: 'Best infrastructure in Caldris', effect: 'infrastructure 60' }, { label: 'Lower risk', effect: 'risk −10' }] }),
    city('CAL-QUE', 'CAL', 'Queenshaven', 'Northern port opening Caldris to sea trade.', { logistics: 20, shippingCostPct: -2.5, marketDemand: 2, riskScore: -5 }, [3.9, 24, 20],
      { functionBonus: { supplyChain: 5 }, benefits: [{ label: 'Lower shipping costs', effect: 'shipping 6.5%' }] }),
    city('CAL-ROS', 'CAL', 'Rosemont', 'Fast-growing consumer city.', { marketDemand: 10, growthRate: 2, purchasingPower: 4, culturalDifficulty: -8, competition: 5 }, [4.1, 22, 18],
      { benefits: [{ label: 'High market demand', effect: 'demand +10' }] }),
    city('CAL-SIL', 'CAL', 'Silverton', 'Wealthy mining city with very high costs.', { purchasingPower: 22, operatingCostMultiplier: 35, labourCostMultiplier: 25, relocationCostMultiplier: 20, riskScore: 10, competition: -5 }, [4.9, 38, 34],
      { benefits: [{ label: 'High customer purchasing power', effect: 'purchasing power 80' }], disadvantages: [{ label: 'Very high costs', effect: 'operating costs +35%, relocation +20%' }, { label: 'Local hiring requirement', effect: 'rule CAL-04' }] }),
    city('CAL-THO', 'CAL', 'Thornfield', 'Remote frontier town with development grants.', { infrastructure: -15, logistics: -12, talentAvailability: -15, competition: -20, opportunityScore: 12, marketDemand: -5, riskScore: 8 }, [3.4, 12, 9],
      { special: { revenuePct: 0, costPct: -15, label: 'Frontier development grant: local costs −15%', active: true }, benefits: [{ label: 'Government grant', effect: 'local costs −15%' }, { label: 'Almost no competition', effect: 'competition 10' }], disadvantages: [{ label: 'Weak infrastructure', effect: 'infrastructure 30' }, { label: 'Local hiring requirement', effect: 'rule CAL-04' }] }),
  ];
}

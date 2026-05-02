import type { MatrixOverrides } from './matrix.js';

export interface Template {
  id: string;
  name: string;
  description: string;
  overrides: MatrixOverrides;
  /** Appended to the generator user prompt as a thematic guide-rail. */
  themeNote?: string;
}

export const TEMPLATES: Record<string, Template> = {
  'default': {
    id: 'default',
    name: 'Wide open',
    description: 'Full sampling matrix — anything goes',
    overrides: {},
  },
  'saas-monetizable': {
    id: 'saas-monetizable',
    name: 'SaaS · monetizable',
    description: 'Digital SaaS with clear subscription / ad-supported monetization and addressable audiences',
    overrides: {
      domains: ['productivity', 'devtools', 'creative', 'finance', 'media', 'edu', 'social', 'fitness', 'health'],
      businessModels: ['subscription', 'freemium', 'usage-based', 'ad-supported', 'b2b licensing'],
      constraints: [
        'must onboard in under 30 seconds',
        'must be GDPR-clean by design',
        'no ML at inference time',
      ],
      timeHorizons: ['shippable in a weekend', 'shippable in a month', 'feasible in 2 years'],
    },
    themeNote: 'Favor digital SaaS products with clear, scalable monetization: subscription tiers, freemium with paid upgrades, usage-based pricing, or ad-supported with addressable user segments. Avoid physical hardware dependencies, offline-only architectures, and non-monetizable cooperative models. Target users should be reachable via paid channels (search, social, programmatic).',
  },
  'hardware-tinkerer': {
    id: 'hardware-tinkerer',
    name: 'Hardware · tinkerer',
    description: 'Physical objects, embedded compute, mesh networking',
    overrides: {
      businessModels: ['one-time hardware', 'open core', 'cooperative', 'b2b licensing'],
      constraints: [
        'must run on a Raspberry Pi',
        'must work fully offline',
        'requires a physical artifact',
        'must use printable QR codes',
        'must be illegal to use indoors',
      ],
      timeHorizons: ['shippable in a month', 'feasible in 2 years', 'science-fiction in 5 years'],
      personas: [
        'hardware tinkerer who hates SaaS',
        'an industrial designer obsessed with material',
        'pessimistic security researcher',
      ],
    },
    themeNote: 'Lean into physical artifacts, embedded compute, mesh networking, and tactile interfaces. Software is fine if it lives on dedicated hardware. Avoid pure cloud SaaS.',
  },
  'civic-public': {
    id: 'civic-public',
    name: 'Civic · public good',
    description: 'Community, cooperative, open infrastructure',
    overrides: {
      domains: ['civic', 'climate', 'safety', 'edu', 'health', 'social', 'food'],
      audiences: ['urban dwellers', 'rural users', 'caregivers', 'teenagers', 'gig workers', 'retirees'],
      businessModels: ['cooperative', 'open core', 'pay-what-you-want', 'ad-supported'],
      vibes: ['sober and serious', 'reverent', 'tender', 'punk', 'bureaucratic-elegant'],
    },
    themeNote: 'Bias toward public-good infrastructure: civic tooling, mutual aid, open data, climate response, accessible safety. Sustainable but not extractive monetization.',
  },
  'enterprise-b2b': {
    id: 'enterprise-b2b',
    name: 'Enterprise · B2B',
    description: 'Sold to companies, not consumers',
    overrides: {
      domains: ['productivity', 'devtools', 'finance', 'safety', 'science'],
      audiences: ['small business owners', 'enterprise teams', 'remote workers'],
      businessModels: ['subscription', 'b2b licensing', 'usage-based', 'open core'],
      constraints: [
        'must be GDPR-clean by design',
        'must onboard in under 30 seconds',
        'fully open-source',
        'no ML at inference time',
      ],
    },
    themeNote: 'Target a buyer at a company, not an individual consumer. Identify the ICP (job title or team) and pricing model (seat, usage, or annual contract).',
  },
  'consumer-mobile': {
    id: 'consumer-mobile',
    name: 'Consumer · mobile',
    description: 'B2C apps for phones — habit-forming, sharable',
    overrides: {
      domains: ['social', 'creative', 'media', 'fitness', 'food', 'health', 'travel', 'fashion'],
      audiences: ['gen z', 'millennials', 'parents of toddlers', 'students', 'urban dwellers', 'gig workers', 'teenagers'],
      businessModels: ['subscription', 'freemium', 'ad-supported', 'usage-based'],
      timeHorizons: ['shippable in a weekend', 'shippable in a month'],
      vibes: ['cozy', 'chaotic', 'mischievous', 'absurdist', 'tender'],
    },
    themeNote: 'Prefer mobile-first B2C apps with strong daily-active hooks and shareability. Favor concepts that produce viral artifacts (clips, scores, lists, leaderboards).',
  },
  'weird-and-specific': {
    id: 'weird-and-specific',
    name: 'Weird · and specific',
    description: 'Maximum strangeness, narrow audience, memorable',
    overrides: {
      vibes: ['absurdist', 'mischievous', 'punk', 'corporate-cosplay', 'bureaucratic-elegant'],
      personas: [
        'former cult member turned product designer',
        'a self-described "weirdest possible" maximizer',
        '14-year-old prodigy',
        'an anthropologist who studies workplaces',
        'a kindly grandmother who codes',
      ],
    },
    themeNote: 'Push for genuinely strange concepts that a reasonable person might dismiss but an enthusiast would find perfect. Specificity > generality. Reject anything that sounds like an investor pitch.',
  },
};

export function getTemplate(id?: string): Template {
  if (!id) return TEMPLATES.default;
  return TEMPLATES[id] ?? TEMPLATES.default;
}

export function listTemplates(): Array<Pick<Template, 'id' | 'name' | 'description'>> {
  return Object.values(TEMPLATES).map(({ id, name, description }) => ({ id, name, description }));
}

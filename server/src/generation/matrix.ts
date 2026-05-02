import type { SamplingCell } from '../types.js';

const DOMAINS = [
  'productivity', 'health', 'food', 'edu', 'social', 'finance',
  'creative', 'travel', 'home', 'media', 'devtools', 'science',
  'civic', 'climate', 'safety', 'pets', 'fitness', 'fashion',
];

const AUDIENCES = [
  'gen z', 'millennials', 'parents of toddlers', 'retirees', 'remote workers',
  'students', 'small business owners', 'enterprise teams', 'rural users',
  'urban dwellers', 'gig workers', 'caregivers', 'teenagers', 'hobbyists',
];

const BUSINESS_MODELS = [
  'subscription', 'freemium', 'one-time hardware', 'marketplace fees',
  'ad-supported', 'open core', 'usage-based', 'cooperative', 'pay-what-you-want',
  'b2b licensing',
];

const CONSTRAINTS = [
  'must work fully offline', 'no smartphone required', 'voice-only interface',
  'must run on a Raspberry Pi', 'must onboard in under 30 seconds',
  'must be GDPR-clean by design', 'no ML at inference time',
  'requires a physical artifact', 'fully open-source', 'must use printable QR codes',
  'no recurring revenue allowed', 'must be illegal to use indoors',
];

const TIME_HORIZONS = [
  'shippable in a weekend', 'shippable in a month', 'feasible in 2 years',
  'science-fiction in 5 years',
];

const VIBES = [
  'cozy', 'chaotic', 'sober and serious', 'mischievous', 'reverent',
  'absurdist', 'tender', 'punk', 'corporate-cosplay', 'bureaucratic-elegant',
];

const PERSONAS = [
  'contrarian VC',
  'hardware tinkerer who hates SaaS',
  'tired teacher with too many ideas',
  '14-year-old prodigy',
  'former cult member turned product designer',
  'librarian-turned-founder',
  'pessimistic security researcher',
  'a kindly grandmother who codes',
  'an industrial designer obsessed with material',
  'an anthropologist who studies workplaces',
  'an ex-pro athlete starting over',
  'a self-described "weirdest possible" maximizer',
];

// Random English words for additional flavor / diversity seed
const SEED_WORDS = [
  'lantern','barnacle','fjord','molasses','filament','syncope','umbra','codex','quasar','pumice',
  'thicket','vellum','ember','catkin','beacon','minstrel','prism','tundra','satchel','marble',
  'nimbus','mariner','cipher','obsidian','plover','shoal','forge','trellis','meadow','cobalt',
  'auger','beetle','citron','dusk','eddy','furrow','glade','heron','ivory','jasper',
  'kestrel','lichen','mosaic','nectar','onyx','plinth','quill','rune','sable','tessera',
  'umlaut','vesper','willow','xenon','yarrow','zephyr','aether','brume','cleaver','dervish',
  'gossamer','helix','ichor','jubilee','knell','lacquer','manticore','nimbus','oracle','penumbra',
];

interface MatrixOpts { count: number; rngSeed?: number; }

function makeRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

export function buildMatrix({ count, rngSeed = Date.now() }: MatrixOpts): SamplingCell[] {
  const rng = makeRng(rngSeed);
  const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const cells: SamplingCell[] = [];
  for (let i = 0; i < count; i++) {
    const seedWordCount = 4 + Math.floor(rng() * 4); // 4-7 words
    const seedWords = Array.from({ length: seedWordCount }, () => pick(SEED_WORDS));
    cells.push({
      domain: pick(DOMAINS),
      audience: pick(AUDIENCES),
      businessModel: pick(BUSINESS_MODELS),
      constraint: pick(CONSTRAINTS),
      timeHorizon: pick(TIME_HORIZONS),
      vibe: pick(VIBES),
      persona: pick(PERSONAS),
      seedWords,
    });
  }
  return cells;
}

export const ALL_DOMAINS = DOMAINS;

import type { LlmCall, LlmProvider, LlmResult } from './index.js';

// Combinatorial pitch generator — produces tens of thousands of unique
// pitch+mechanism+target combinations, deterministic for a given seed.

const PREFIXES = [
  'Pocket','Whisper','Drift','Glade','Ember','Lantern','Forge','Iron','Vellum','Thicket',
  'Neon','Quiet','Loud','Soft','Iron','Tundra','Chrome','Brume','Shadow','Hollow',
  'Stark','Murmur','Lattice','Cinder','Spire','Plinth','Velvet','Verdant','Halcyon','Granite',
  'Ash','Auburn','Bramble','Citadel','Driftwood','Echo','Faraway','Gilded','Honeyed','Indigo',
  'Jade','Kaleidoscope','Lichen','Marigold','Nimbus','Onyx','Pewter','Quartz','Russet','Sable',
];
const NOUNS = [
  'Tide','Loom','Ledger','Shelter','Rink','Codex','Lighthouse','Pantry','Conservatory','Atlas',
  'Compass','Almanac','Embassy','Quarry','Forum','Treasury','Foundry','Apothecary','Greenhouse','Reserve',
  'Beacon','Crucible','Drydock','Echo','Furrow','Garrison','Hearth','Inkwell','Jubilee','Keepsake',
  'Lyceum','Manor','Niche','Outpost','Parlor','Quintet','Refuge','Sanctum','Telegraph','Underbrush',
  'Vault','Workshop','Xenon','Yardstick','Zephyr','Cartograph','Daystar','Etcher','Filament','Granary',
];
const MOD_SUFFIXES = [
  '','Co','HQ','+','Studio','Lab','Works','House','Yard','Bureau','Press','Trust',
  'OS','Loop','Net','Field','Park','Society','Guild','Company','League','Cooperative','Outfit','Hall',
];
const MECH_TEMPLATES = [
  'A %TECH% that %ACTION% for %USER% by quietly %DETAIL%, billed via %MODEL%.',
  'Local-first %SURFACE% that %ACTION% — never uploads, runs on %TECH%, makes %DETAIL% finally tractable.',
  'A %SHAPE% that pairs %TECH% with %ACTION% so %USER% can %BENEFIT% without %FRICTION%.',
  '%TECH% on a %SURFACE%; you %ACTION% and it %DETAIL%, %MODEL% only after %BENEFIT% lands.',
  'Cooperative %SURFACE% where %USER% %ACTION% in short bursts, then %DETAIL% once a quorum signs off.',
  'Background %SHAPE% that watches %TECH% all day and %ACTION%, surfacing only when %DETAIL% threshold trips.',
];
const TECH = ['CV pipeline','tiny on-device LLM','LoRa mesh','MIDI listener','OCR loop','vector store','event log','signed RSS feed','printable QR menu','passive radar','sub-GHz radio'];
const ACTION = ['catalogs','rebalances','arbitrages','rehearses','negotiates','escrows','annotates','triages','sketches','rehydrates'];
const USER = ['solo founders','aging artisans','remote-only teams','rural commuters','gig caregivers','urban anglers','gym-skipping retirees','part-time educators','first-time parents','overcommitted hobbyists'];
const DETAIL = ['stitching tax-grade timestamps','reconciling six accounting axioms','flagging anomalous gait','redacting PII inline','summarizing a week in 14 words','bundling micro-payouts'];
const MODEL_BIZ = ['pay-per-use','co-op dues','one-time hardware','seat licenses','annual pre-pay','revenue share','sponsorship'];
const SURFACE = ['e-ink slab','fridge tablet','bench-mounted dial','keychain dongle','headphone shell','projector strip','sleeve patch','calendar widget','desk runner'];
const SHAPE = ['ritual','marketplace','journal','primer','almanac','compass'];
const BENEFIT = ['close the loop','keep the lights on','hold the streak','make it ship','cool the room','find the missing piece'];
const FRICTION = ['a Zoom call','a hidden subscription','an AWS bill','an unread inbox','a four-hour onboarding','an offline outage'];
const TARGETS = [
  'rural broadband holdouts','small-town librarians','first-gen college kids','bartenders rebooting careers','independent vets in vet deserts',
  'former teachers in second acts','solo product designers','side-project hardware tinkerers','off-grid retirees','community gardeners',
  'community college adjuncts','single dads of toddlers','recent immigrants in trades','fishing co-ops in coastal towns','rural EMTs',
];
const WHYNOW = [
  'cheap inference finally crossed below 10¢ a query',
  'GenZ\'s phone-fatigue wave just turned mainstream',
  'post-pandemic trades labor shortage made on-site coaching premium',
  'new EU offline-first guidance unlocked GDPR-clean tooling',
  'open-weight code models now sketch firmware in seconds',
  'satellite image cadence dropped from weekly to hourly',
];
const RISK = [
  'liability the moment a single false negative becomes a tort',
  'TAM looks great in interviews but collapses on actual conversion',
  'requires regulatory novelty most local boards aren\'t ready for',
  'competing with a free Excel template most users already have',
  'creates a rumor mill any moderation budget can\'t police',
  'works only in the four metros where supply density is over 200 nodes',
];
const CATEGORIES = [
  'productivity','health','food','edu','social','finance','creative','travel','home','media',
  'devtools','science','civic','climate','safety','pets','fitness','fashion','hardware','ai',
  'compliance','marketplace','agri-science','fintech','edtech','climate hardware','pet health',
];
const TAG_POOL = ['ml','geo','b2c','b2b','hardware','iot','privacy','consumer','saas','marketplace','social','open-source','offline-first','crypto','ad-supported','subscription','co-op'];

function fill(template: string, rng: () => number): string {
  return template
    .replace(/%TECH%/g, () => TECH[Math.floor(rng() * TECH.length)])
    .replace(/%ACTION%/g, () => ACTION[Math.floor(rng() * ACTION.length)])
    .replace(/%USER%/g, () => USER[Math.floor(rng() * USER.length)])
    .replace(/%DETAIL%/g, () => DETAIL[Math.floor(rng() * DETAIL.length)])
    .replace(/%MODEL%/g, () => MODEL_BIZ[Math.floor(rng() * MODEL_BIZ.length)])
    .replace(/%SURFACE%/g, () => SURFACE[Math.floor(rng() * SURFACE.length)])
    .replace(/%SHAPE%/g, () => SHAPE[Math.floor(rng() * SHAPE.length)])
    .replace(/%BENEFIT%/g, () => BENEFIT[Math.floor(rng() * BENEFIT.length)])
    .replace(/%FRICTION%/g, () => FRICTION[Math.floor(rng() * FRICTION.length)]);
}

export class MockProvider implements LlmProvider {
  private callCount = 0;
  private rng: () => number;
  constructor(seed = 1234) {
    let s = seed;
    this.rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  }

  async call<T = unknown>(req: LlmCall): Promise<LlmResult<T>> {
    this.callCount++;
    await new Promise((r) => setTimeout(r, 30 + Math.floor(this.rng() * 60)));
    const sys = req.systemPrompt;
    if (sys.includes('IDEA_GENERATOR')) return this.generateIdea<T>(req.userPrompt);
    if (sys.includes('RUBRIC_JUDGE')) return this.scoreIdea<T>(req.userPrompt);
    if (sys.includes('PAIRWISE_JUDGE')) return this.judgePair<T>(req.userPrompt);
    if (sys.includes('DEEP_JUDGE')) return this.deepReview<T>(req.userPrompt);
    throw new Error('Unknown mock prompt');
  }

  private generateIdea<T>(_userPrompt: string): LlmResult<T> {
    const rng = this.rng;
    const prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
    const noun = NOUNS[Math.floor(rng() * NOUNS.length)];
    const suffix = MOD_SUFFIXES[Math.floor(rng() * MOD_SUFFIXES.length)];
    const pitch = suffix ? `${prefix} ${noun} ${suffix}` : `${prefix} ${noun}`;
    const mechTemplate = MECH_TEMPLATES[Math.floor(rng() * MECH_TEMPLATES.length)];
    const mechanism = fill(mechTemplate, rng);
    const targetUser = TARGETS[Math.floor(rng() * TARGETS.length)];
    const whyNow = WHYNOW[Math.floor(rng() * WHYNOW.length)];
    const biggestRisk = RISK[Math.floor(rng() * RISK.length)];
    const category = CATEGORIES[Math.floor(rng() * CATEGORIES.length)];
    const tagCount = 1 + Math.floor(rng() * 3);
    const tags = Array.from({ length: tagCount }, () => TAG_POOL[Math.floor(rng() * TAG_POOL.length)]);
    const data = { pitch, mechanism, targetUser, whyNow, biggestRisk, category, tags };
    return { data: data as T, raw: JSON.stringify(data) };
  }

  private scoreIdea<T>(_userPrompt: string): LlmResult<T> {
    const r = () => Math.round((1 + this.rng() * 9) * 10) / 10;
    const novelty = r();
    const feasibility = r();
    const market = r();
    const weirdness = r();
    const buildability = r();
    const data = {
      critique: 'mock: score reflects random distribution',
      novelty,
      feasibility,
      market,
      weirdness,
      buildability,
    };
    return { data: data as T, raw: JSON.stringify(data) };
  }

  private judgePair<T>(_userPrompt: string): LlmResult<T> {
    const winner = this.rng() < 0.5 ? 'A' : 'B';
    const data = {
      winner,
      reason: 'mock: coin-flip with bias toward feasibility',
    };
    return { data: data as T, raw: JSON.stringify(data) };
  }

  private deepReview<T>(_userPrompt: string): LlmResult<T> {
    const data = {
      verdict: this.rng() < 0.6 ? 'advance' : 'eliminate',
      strongestPoint: 'mock strongest point',
      fatalFlaw: 'mock fatal flaw',
      score: Math.round((5 + this.rng() * 5) * 10) / 10,
    };
    return { data: data as T, raw: JSON.stringify(data) };
  }

  get stats() { return { calls: this.callCount }; }
}

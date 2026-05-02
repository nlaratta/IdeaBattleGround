import type { LlmCall, LlmProvider, LlmResult } from './index.js';

const SAMPLE_PITCHES = [
  ['Pocket Tide', 'Predict riptides on your beach using crowdsourced wave-cam frames and a tiny on-device CNN.', 'beach-goers, surfers', 'beach drownings spike each year', 'data sparsity in offshore zones', 'safety', ['ml','geo','b2c']],
  ['Choreboard', 'A magnetic fridge tablet that lets families assign and complete chores via wipe gestures.', 'parents of kids 6-12', 'cheap e-ink panels finally reliable', 'kids will sabotage the gestures', 'family', ['hardware','consumer']],
  ['DriftDocs', 'Live drift-typing notes that fade unless you keep editing — forces you to keep momentum on a draft.', 'writers, students', 'attention crises and writer block', 'might infuriate perfectionists', 'productivity', ['saas','writing']],
  ['Ambient Lawyer', 'A passive listener that flags risky clauses in a meeting in real time, only audible to one earbud.', 'startup founders', 'cheap inference + earbuds + meeting glut', 'recording laws vary by state', 'legal', ['ai','b2b']],
  ['Foragr', 'Map of urban edible plants validated by a botanist DAO, with seasonal pop-ups.', 'urban foragers, food curious', 'food costs + foraging revival', 'liability if someone misidentifies', 'food', ['social','geo']],
  ['Kitchen Kabuki', 'Recipe app that teaches you a dish via theatrical voice cues and dramatic timer chimes.', 'home cooks who like media', 'cooking-as-entertainment trend', 'might be too goofy for repeat use', 'food', ['consumer','audio']],
  ['Dust Trail', 'Wearable that pings you when your kid is more than X meters away in a crowd, P2P mesh, no GPS needed.', 'parents at theme parks', 'mesh radios got cheap', 'battery life on tiny wearables', 'safety', ['hardware','iot']],
  ['Moot Court Sim', 'AI sparring partner for law students that argues opposing positions in real-time mock trials.', 'law students', 'AI good enough at legal reasoning', 'might encode bad case law', 'edu', ['ai','edu']],
  ['Refrigerator Diary', 'Snap your fridge weekly; AI tracks waste patterns and nudges grocery list changes.', 'households trying to budget', 'food waste + grocery inflation', 'photo upload friction', 'food', ['ai','consumer']],
  ['Boring Co-op', 'Match co-working sessions for boring solo tasks (taxes, paperwork) — body doubling but with a timer.', 'ADHD freelancers', 'remote work loneliness', 'matching at low scale', 'productivity', ['social','saas']],
  ['Soundprint', 'A privacy-first hum-to-search for finding "that song from the cafe" without uploading audio anywhere.', 'music lovers privacy minded', 'on-device audio fingerprinting', 'fingerprint coverage limits', 'media', ['privacy','consumer']],
  ['Granny Telemetry', 'Senior care app that watches movement patterns via a single camera, no wearable, alerts on falls/changes.', 'adult children of aging parents', 'demographics + camera ML', 'creepy if not framed right', 'health', ['ml','consumer']],
  ['Phantom Inbox', 'Email client that pretends to send replies but holds them for 30 minutes — undo by default.', 'email-anxiety power users', 'AI summarization makes recall ok', 'expectations of instant delivery', 'productivity', ['saas','email']],
  ['Trade School Tinder', 'Match aspiring tradespeople with master craftspeople for short shadowing days.', 'career switchers', 'trade labor shortage', 'liability and insurance', 'edu', ['marketplace','social']],
  ['Lemonade Stand DAO', 'Let kids run real lemonade stands with parental smart-contract custody for earnings.', 'parents teaching finance', 'crypto rails finally usable', 'parents skeptical of crypto', 'finance', ['edu','crypto']],
  ['Forensic Linter', 'CI bot that explains in plain English what each test failure is actually telling you.', 'overworked devs', 'flaky test pain', 'verbose noise', 'devtools', ['ai','b2b']],
  ['Whispernet', 'Hyperlocal anonymous bulletin board scoped to your apartment building.', 'apartment dwellers', 'community in cities collapsing', 'moderation hard at small scale', 'social', ['social','geo']],
  ['Bedside Cipher', 'A tiny e-ink puzzle box you solve before bed to stop doomscrolling.', 'phone-addicted adults', 'attention reform', 'people just won\'t use it', 'health', ['hardware','consumer']],
  ['Reverse Yelp', 'Restaurants leave honest reviews of customer behavior — visible only to other restaurants.', 'restaurant owners', 'restaurant labor crunch', 'becomes blacklist nightmare', 'food', ['b2b','social']],
  ['Time Tax', 'A subscription that fines you for wasted hours on certain apps and donates to a cause you set.', 'self-improvement crowd', 'commitment devices popular', 'creepy data access', 'productivity', ['saas','consumer']],
];

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
    const sample = SAMPLE_PITCHES[Math.floor(this.rng() * SAMPLE_PITCHES.length)];
    const [title, mech, user, why, risk, cat, tags] = sample;
    const variant = Math.floor(this.rng() * 9999);
    const data = {
      pitch: `${title} (#${variant})`,
      mechanism: mech,
      targetUser: user,
      whyNow: why,
      biggestRisk: risk,
      category: cat,
      tags,
    };
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

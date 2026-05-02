import { nanoid } from 'nanoid';
import type { Event, IdeaState, RoundPhase, TournamentState } from './types.js';
import { generateIdeas } from './generation/generate.js';
import { dedupeIdeas } from './judging/dedup.js';
import { scoreAllIdeas } from './judging/rubric.js';
import { runSwissRound, pairSwiss, judgePairSilent } from './judging/pairwise.js';
import { generateTaunt } from './judging/taunt.js';
import { sleep } from './util/sleep.js';
import { deepReview } from './judging/deep.js';
import { layoutIdea, categoryColor } from './layout.js';
import { INITIAL_ELO } from './judging/elo.js';
import type { EventBus } from './events/bus.js';
import { mapWithLimit } from './util/concurrent.js';
import { config } from './config.js';
import * as store from './db/store.js';

export interface ModelOverrides {
  generator?: string;
  judge?: string;
  deepJudge?: string;
  taunt?: string;
}

export interface TournamentOptions {
  ideaCount: number;
  judgesPerIdea: number;
  swissRounds: number;
  finalists: number;
  rngSeed?: number;
  /** Pace the run for streaming: sleeps between phases, serialize pairwise duels with announcements. */
  cinematic?: boolean;
  /** Per-duel pause when cinematic. Defaults to 2500. */
  duelMs?: number;
  /** Per-phase model overrides. Aliases (sonnet/opus/haiku) or full model IDs. */
  models?: ModelOverrides;
}

const DEFAULTS: TournamentOptions = {
  ideaCount: 30,
  judgesPerIdea: 3,
  swissRounds: 5,
  finalists: 6,
  cinematic: false,
  duelMs: 2500,
};

let current: TournamentState | null = null;
let running = false;

export function getCurrent(): TournamentState | null { return current; }

function setPhase(t: TournamentState, phase: RoundPhase, bus: EventBus) {
  t.phase = phase;
  bus.emit({ type: 'phase:change', phase, ts: Date.now() } as Event);
}

export async function runTournament(opts: Partial<TournamentOptions> | undefined, bus: EventBus): Promise<TournamentState> {
  if (running) throw new Error('Tournament already running');
  running = true;
  const o = { ...DEFAULTS, ...(opts ?? {}) };
  const tournament: TournamentState = {
    id: nanoid(8),
    phase: 'idle',
    round: 0,
    startedAt: Date.now(),
    ideas: {},
    pairwiseRoundsRun: 0,
    champions: [],
  };
  current = tournament;
  bus.clear();
  store.insertTournament(tournament.id, tournament.startedAt, o);
  bus.emit({ type: 'tournament:start', tournamentId: tournament.id, targetCount: o.ideaCount, cinematic: !!o.cinematic, ts: Date.now() });

  const models = o.models ?? {};

  try {
    setPhase(tournament, 'generating', bus);
    const ideas = await generateIdeas(o.ideaCount, bus, o.rngSeed, models.generator);
    // Stash all generated ideas — even ones that get culled — so the DB has full provenance.
    for (const idea of ideas) {
      const pos = layoutIdea(idea);
      const color = categoryColor(idea.category);
      store.insertIdea(tournament.id, idea, pos, color);
    }
    bus.emit({ type: 'log', level: 'info', msg: `generated ${ideas.length}/${o.ideaCount} ideas`, ts: Date.now() });

    const { kept, killed } = dedupeIdeas(ideas);
    for (const k of killed) {
      store.killIdea(k.id, 0);
      bus.emit({ type: 'idea:killed', ideaId: k.id, reason: 'near-duplicate', round: 0, ts: Date.now() });
    }

    for (const idea of kept) {
      const pos = layoutIdea(idea);
      tournament.ideas[idea.id] = {
        idea,
        scores: [],
        meanScore: 0,
        elo: INITIAL_ELO,
        wins: 0,
        losses: 0,
        alive: true,
        position: pos,
        color: categoryColor(idea.category),
      };
    }

    setPhase(tournament, 'rubric', bus);
    const scoresById = await scoreAllIdeas(kept, o.judgesPerIdea, bus, models.judge);
    for (const [id, scores] of Object.entries(scoresById)) {
      const state = tournament.ideas[id];
      if (!state) continue;
      state.scores = scores;
      state.meanScore = scores.reduce((a, b) => a + b.total, 0) / scores.length;
      scores.forEach((s, idx) => store.insertRubricScore(id, idx, s));
      store.updateIdeaScoreSummary(id, state.meanScore);
    }

    setPhase(tournament, 'culling', bus);
    const sortedByScore = Object.values(tournament.ideas).sort((a, b) => b.meanScore - a.meanScore);
    const cutoff = Math.max(o.finalists, Math.ceil(sortedByScore.length * 0.4));
    const survivors = sortedByScore.slice(0, cutoff);
    const survivorSet = new Set(survivors.map((s) => s.idea.id));
    const culls = Object.values(tournament.ideas).filter((s) => !survivorSet.has(s.idea.id));
    if (o.cinematic && culls.length > 0) {
      // Sort cull order from worst score upward so the slowest deaths trickle to the better-but-not-quite-good-enough ideas.
      culls.sort((a, b) => a.meanScore - b.meanScore);
      const cascadeMs = Math.min(4000, culls.length * 110);
      const step = cascadeMs / culls.length;
      for (const state of culls) {
        state.alive = false;
        state.killedInRound = 1;
        store.killIdea(state.idea.id, 1);
        bus.emit({ type: 'idea:killed', ideaId: state.idea.id, reason: 'rubric-cull', round: 1, ts: Date.now() });
        await sleep(step);
      }
    } else {
      for (const state of culls) {
        state.alive = false;
        state.killedInRound = 1;
        store.killIdea(state.idea.id, 1);
        bus.emit({ type: 'idea:killed', ideaId: state.idea.id, reason: 'rubric-cull', round: 1, ts: Date.now() });
      }
    }

    if (o.cinematic) await sleep(2500);

    setPhase(tournament, 'pairwise', bus);
    for (let r = 0; r < o.swissRounds; r++) {
      tournament.round = r + 1;
      const alive = Object.values(tournament.ideas).filter((s) => s.alive);
      let results;
      if (o.cinematic) {
        // Sequence each duel with announcement → pause for animation → judge silently
        // → emit pairwise:result so the camera/UI gets the full cinematic window.
        const pairs = pairSwiss(alive);
        results = [];
        const isMockMode = config.mockMode;
        for (const [a, b] of pairs) {
          bus.emit({ type: 'duel:start', aId: a.idea.id, bId: b.idea.id, round: tournament.round, expectedMs: o.duelMs ?? 2500, ts: Date.now() });
          const judgePromise = judgePairSilent(a, b, bus, models.judge);
          // Generate a taunt in parallel — fire-and-forget, emitted whenever it lands.
          generateTaunt(a, b, isMockMode, models.taunt).then((quote) => {
            if (quote) bus.emit({ type: 'duel:taunt', aId: a.idea.id, bId: b.idea.id, quote, ts: Date.now() });
          }).catch(() => { /* taunts are decorative; never crash on failure */ });
          await sleep(o.duelMs ?? 2500);
          const res = await judgePromise;
          if (res) {
            bus.emit({ type: 'pairwise:result', winnerId: res.winnerId, loserId: res.loserId, reason: res.reason, eloDelta: res.eloDelta, ts: Date.now() });
            results.push(res);
          }
        }
      } else {
        results = await runSwissRound(alive, bus, models.judge);
      }
      tournament.pairwiseRoundsRun++;
      for (const res of results) {
        store.insertPairwise(tournament.id, res.winnerId, res.loserId, res.reason, res.eloDelta, tournament.round, Date.now());
      }
      for (const state of alive) {
        store.updateIdeaElo(state.idea.id, state.elo, state.wins, state.losses);
      }
      store.updateTournamentPhase(tournament.id, 'pairwise', tournament.pairwiseRoundsRun);
      if (o.cinematic) await sleep(1500);
    }

    // Cull losers from pairwise: keep top finalists by Elo
    const aliveByElo = Object.values(tournament.ideas).filter((s) => s.alive).sort((a, b) => b.elo - a.elo);
    const finalists = aliveByElo.slice(0, o.finalists);
    const finalistSet = new Set(finalists.map((s) => s.idea.id));
    for (const state of aliveByElo) {
      if (!finalistSet.has(state.idea.id)) {
        state.alive = false;
        state.killedInRound = tournament.pairwiseRoundsRun;
        store.killIdea(state.idea.id, tournament.pairwiseRoundsRun);
        bus.emit({ type: 'idea:killed', ideaId: state.idea.id, reason: 'pairwise-cull', round: tournament.pairwiseRoundsRun, ts: Date.now() });
      }
    }

    if (o.cinematic) await sleep(2000);

    setPhase(tournament, 'deep', bus);
    const verdicts = o.cinematic
      ? await (async () => {
          const out: Array<{ state: typeof finalists[number]; verdict: Awaited<ReturnType<typeof deepReview>> }> = [];
          for (const state of finalists) {
            const verdict = await deepReview(state, models.deepJudge);
            out.push({ state, verdict });
            await sleep(1200);
          }
          return out;
        })()
      : await mapWithLimit(finalists, config.judgingConcurrency, async (state) => ({
          state,
          verdict: await deepReview(state, models.deepJudge),
        }));
    for (const { state, verdict } of verdicts) {
      if (verdict) store.insertDeepVerdict(state.idea.id, verdict, Date.now());
    }
    const champions = verdicts
      .filter(({ verdict }) => verdict?.verdict === 'advance')
      .sort((a, b) => (b.verdict?.score ?? 0) - (a.verdict?.score ?? 0))
      .slice(0, 3);
    tournament.champions = champions.map(({ state }) => state.idea.id);
    for (const { state } of champions) {
      bus.emit({ type: 'champion', ideaId: state.idea.id, finalElo: state.elo, ts: Date.now() });
    }

    setPhase(tournament, 'complete', bus);
    const completedAt = Date.now();
    store.completeTournament(tournament.id, tournament.champions, completedAt);
    bus.emit({ type: 'tournament:complete', tournamentId: tournament.id, ts: completedAt });
    return tournament;
  } finally {
    running = false;
  }
}

export function isRunning(): boolean { return running; }

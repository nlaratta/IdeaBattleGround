import { nanoid } from 'nanoid';
import type { Event, IdeaState, RoundPhase, TournamentState } from './types.js';
import { generateIdeas } from './generation/generate.js';
import { dedupeIdeas } from './judging/dedup.js';
import { scoreAllIdeas } from './judging/rubric.js';
import { runSwissRound } from './judging/pairwise.js';
import { deepReview } from './judging/deep.js';
import { layoutIdea, categoryColor } from './layout.js';
import { INITIAL_ELO } from './judging/elo.js';
import type { EventBus } from './events/bus.js';
import { mapWithLimit } from './util/concurrent.js';
import { config } from './config.js';
import * as store from './db/store.js';

export interface TournamentOptions {
  ideaCount: number;
  judgesPerIdea: number;
  swissRounds: number;
  finalists: number;
  rngSeed?: number;
}

const DEFAULTS: TournamentOptions = {
  ideaCount: 30,
  judgesPerIdea: 3,
  swissRounds: 5,
  finalists: 6,
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
  bus.emit({ type: 'tournament:start', tournamentId: tournament.id, targetCount: o.ideaCount, ts: Date.now() });

  try {
    setPhase(tournament, 'generating', bus);
    const ideas = await generateIdeas(o.ideaCount, bus, o.rngSeed);
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
    const scoresById = await scoreAllIdeas(kept, o.judgesPerIdea, bus);
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
    for (const state of Object.values(tournament.ideas)) {
      if (!survivorSet.has(state.idea.id)) {
        state.alive = false;
        state.killedInRound = 1;
        store.killIdea(state.idea.id, 1);
        bus.emit({ type: 'idea:killed', ideaId: state.idea.id, reason: 'rubric-cull', round: 1, ts: Date.now() });
      }
    }

    setPhase(tournament, 'pairwise', bus);
    for (let r = 0; r < o.swissRounds; r++) {
      tournament.round = r + 1;
      const alive = Object.values(tournament.ideas).filter((s) => s.alive);
      const results = await runSwissRound(alive, bus);
      tournament.pairwiseRoundsRun++;
      // persist pairwise outcomes + Elo updates
      for (const res of results) {
        store.insertPairwise(tournament.id, res.winnerId, res.loserId, res.reason, res.eloDelta, tournament.round, Date.now());
      }
      for (const state of alive) {
        store.updateIdeaElo(state.idea.id, state.elo, state.wins, state.losses);
      }
      store.updateTournamentPhase(tournament.id, 'pairwise', tournament.pairwiseRoundsRun);
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

    setPhase(tournament, 'deep', bus);
    const verdicts = await mapWithLimit(finalists, config.judgingConcurrency, async (state) => ({
      state,
      verdict: await deepReview(state),
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

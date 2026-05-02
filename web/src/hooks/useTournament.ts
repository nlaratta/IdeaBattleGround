import { useEffect, useReducer, useRef } from 'react';
import type { Event, IdeaState, RoundPhase } from '../types';
import type { BreakingItem } from '../components/BreakingNews';

interface PairFlash {
  winnerId: string;
  loserId: string;
  reason: string;
  ts: number;
}

interface KillBurst {
  ideaId: string;
  position: { x: number; y: number };
  color: string;
  ts: number;
}

export interface ActiveDuel {
  aId: string;
  bId: string;
  round: number;
  startedAt: number;
  expectedMs: number;
  /** Set once pairwise:result arrives. While present, the card is in "winner reveal" linger state. */
  winnerId?: string;
  reason?: string;
  eloDelta?: number;
  resolvedAt?: number;
}

interface State {
  phase: RoundPhase;
  round: number;
  ideas: Record<string, IdeaState>;
  pairFlashes: PairFlash[]; // recent — used for visual pulses
  killBursts: KillBurst[];
  champions: string[];
  log: { level: string; msg: string; ts: number }[];
  ticker: { msg: string; ts: number; kind: string }[];
  totalIdeas: number;
  aliveCount: number;
  startedAt: number | null;
  recentEloDeltas: { ideaId: string; delta: number; ts: number }[];
  activeDuel: ActiveDuel | null;
  cinematic: boolean;
  breakingNews: BreakingItem[];
  firstCullDone: boolean;
  taunts: Record<string, string>; // duelKey → quote
  completeTs: number | null;
}

const initialState: State = {
  phase: 'idle',
  round: 0,
  ideas: {},
  pairFlashes: [],
  killBursts: [],
  champions: [],
  log: [],
  ticker: [],
  totalIdeas: 0,
  aliveCount: 0,
  startedAt: null,
  recentEloDeltas: [],
  activeDuel: null,
  cinematic: false,
  breakingNews: [],
  firstCullDone: false,
  taunts: {},
  completeTs: null,
};

function reducer(state: State, ev: Event): State {
  switch (ev.type) {
    case 'tournament:start':
      return { ...initialState, startedAt: ev.ts, totalIdeas: 0, cinematic: !!ev.cinematic };
    case 'phase:change':
      // Leaving pairwise → clear any leftover duel card.
      return {
        ...state,
        phase: ev.phase,
        activeDuel: ev.phase !== 'pairwise' ? null : state.activeDuel,
        ticker: pushTicker(state.ticker, `phase: ${ev.phase}`, 'phase', ev.ts),
      };
    case 'idea:generated': {
      const id = ev.idea.id;
      const next: IdeaState = {
        idea: ev.idea,
        scores: [],
        meanScore: 0,
        elo: 1200,
        wins: 0,
        losses: 0,
        alive: true,
        position: pseudoLayout(ev.idea.category, ev.idea.id),
        color: categoryColor(ev.idea.category),
      };
      return {
        ...state,
        ideas: { ...state.ideas, [id]: next },
        totalIdeas: state.totalIdeas + 1,
        aliveCount: state.aliveCount + 1,
      };
    }
    case 'idea:scored': {
      const s = state.ideas[ev.ideaId];
      if (!s) return state;
      const scores = [...s.scores, ev.score];
      const meanScore = scores.reduce((a, b) => a + b.total, 0) / scores.length;
      return { ...state, ideas: { ...state.ideas, [ev.ideaId]: { ...s, scores, meanScore } } };
    }
    case 'idea:killed': {
      const s = state.ideas[ev.ideaId];
      if (!s || !s.alive) return state;
      const burst: KillBurst = {
        ideaId: ev.ideaId,
        position: s.position,
        color: s.color,
        ts: ev.ts,
      };
      const ideasNext = { ...state.ideas, [ev.ideaId]: { ...s, alive: false, killedInRound: ev.round } };
      // Detect "last of category" — was this the last alive in its category?
      const cat = s.idea.category;
      const stillAliveInCat = Object.values(ideasNext).filter((x) => x.idea.category === cat && x.alive).length;
      const totalInCat = Object.values(ideasNext).filter((x) => x.idea.category === cat).length;

      const breaking: BreakingItem[] = [];
      // First pairwise cull — the "first casualty" beat
      if (!state.firstCullDone && ev.reason === 'pairwise-cull') {
        breaking.push({
          id: `firstcull-${ev.ideaId}`,
          kind: 'first-cull',
          msg: `${s.idea.pitch} is the first to fall in head-to-head.`,
          detail: ev.reason,
          ts: ev.ts,
        });
      }
      // Last of category (only meaningful if there were >=2 in this cat originally)
      if (stillAliveInCat === 0 && totalInCat >= 2) {
        breaking.push({
          id: `lastof-${cat}-${ev.ts}`,
          kind: 'last-of-kind',
          msg: `${s.idea.pitch} was the final ${cat} idea standing.`,
          detail: `${cat.toUpperCase()} cluster eliminated`,
          ts: ev.ts,
        });
      }
      return {
        ...state,
        aliveCount: Math.max(0, state.aliveCount - 1),
        ideas: ideasNext,
        killBursts: [...state.killBursts, burst].slice(-40),
        firstCullDone: state.firstCullDone || ev.reason === 'pairwise-cull',
        breakingNews: [...state.breakingNews, ...breaking].slice(-20),
        ticker: pushTicker(state.ticker, `${s.idea.pitch} eliminated (${ev.reason})`, 'kill', ev.ts),
      };
    }
    case 'duel:start': {
      return {
        ...state,
        activeDuel: { aId: ev.aId, bId: ev.bId, round: ev.round, startedAt: ev.ts, expectedMs: ev.expectedMs },
        ticker: pushTicker(state.ticker, `duel: ${state.ideas[ev.aId]?.idea.pitch ?? '?'} vs ${state.ideas[ev.bId]?.idea.pitch ?? '?'}`, 'duel', ev.ts),
      };
    }
    case 'duel:taunt': {
      const key = duelKey(ev.aId, ev.bId);
      return { ...state, taunts: { ...state.taunts, [key]: ev.quote } };
    }
    case 'pairwise:result': {
      const w = state.ideas[ev.winnerId];
      const l = state.ideas[ev.loserId];
      const ideas = { ...state.ideas };
      const winnerWins = (w?.wins ?? 0) + 1;
      if (w) ideas[w.idea.id] = { ...w, elo: w.elo + ev.eloDelta, wins: winnerWins };
      if (l) ideas[l.idea.id] = { ...l, elo: l.elo - ev.eloDelta, losses: l.losses + 1 };
      const flash: PairFlash = { winnerId: ev.winnerId, loserId: ev.loserId, reason: ev.reason, ts: ev.ts };
      const pairFlashes = [...state.pairFlashes, flash].slice(-50);
      const recentEloDeltas = [
        { ideaId: ev.winnerId, delta: ev.eloDelta, ts: ev.ts },
        { ideaId: ev.loserId, delta: -ev.eloDelta, ts: ev.ts },
        ...state.recentEloDeltas,
      ].slice(0, 30);
      // If this result is for the active duel, transition the card to
      // winner-reveal state instead of clearing it. Card stays up until the
      // next duel:start fires (or phase changes).
      const matchesActive = state.activeDuel
        && (state.activeDuel.aId === ev.winnerId || state.activeDuel.aId === ev.loserId)
        && (state.activeDuel.bId === ev.winnerId || state.activeDuel.bId === ev.loserId);
      const activeDuel = matchesActive
        ? { ...state.activeDuel!, winnerId: ev.winnerId, reason: ev.reason, eloDelta: ev.eloDelta, resolvedAt: ev.ts }
        : state.activeDuel;

      const breaking: BreakingItem[] = [];
      // Streak: 3+ in a row
      if (winnerWins >= 3 && winnerWins % 1 === 0 && w) {
        breaking.push({
          id: `streak-${w.idea.id}-${winnerWins}`,
          kind: 'streak',
          msg: `${w.idea.pitch} on a ${winnerWins}-win streak.`,
          detail: `current elo ${(w.elo + ev.eloDelta).toFixed(0)}`,
          ts: ev.ts,
        });
      }
      // Upset: loser was rated meaningfully higher than winner before the duel.
      if (w && l) {
        const beforeWinner = w.elo;
        const beforeLoser = l.elo;
        if (beforeLoser - beforeWinner >= 40) {
          breaking.push({
            id: `upset-${w.idea.id}-${l.idea.id}-${ev.ts}`,
            kind: 'upset',
            msg: `${w.idea.pitch} just beat ${l.idea.pitch}.`,
            detail: `underdog by ${(beforeLoser - beforeWinner).toFixed(0)} elo`,
            ts: ev.ts,
          });
        }
      }

      return {
        ...state,
        ideas,
        pairFlashes,
        recentEloDeltas,
        activeDuel,
        breakingNews: [...state.breakingNews, ...breaking].slice(-20),
        ticker: pushTicker(state.ticker, `${w?.idea.pitch ?? '?'} beat ${l?.idea.pitch ?? '?'} — ${ev.reason}`, 'duel', ev.ts),
      };
    }
    case 'champion': {
      const champ = state.ideas[ev.ideaId];
      const breaking: BreakingItem[] = champ ? [{
        id: `champion-${ev.ideaId}`,
        kind: 'champion',
        msg: `${champ.idea.pitch} crowned champion.`,
        detail: `final elo ${ev.finalElo.toFixed(0)}`,
        ts: ev.ts,
      }] : [];
      return {
        ...state,
        champions: [...state.champions, ev.ideaId],
        breakingNews: [...state.breakingNews, ...breaking].slice(-20),
        ticker: pushTicker(state.ticker, `🏆 champion: ${state.ideas[ev.ideaId]?.idea.pitch ?? ev.ideaId}`, 'champ', ev.ts),
      };
    }
    case 'tournament:complete':
      return { ...state, completeTs: ev.ts, ticker: pushTicker(state.ticker, 'tournament complete', 'done', ev.ts) };
    case 'log':
      return { ...state, log: [...state.log, { level: ev.level, msg: ev.msg, ts: ev.ts }].slice(-100) };
  }
}

function pushTicker(prev: State['ticker'], msg: string, kind: string, ts: number) {
  return [...prev, { msg, kind, ts }].slice(-60);
}

export function duelKey(aId: string, bId: string) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

const COLORS: Record<string, string> = {
  productivity: '#7CC4FF', health: '#86E2A2', food: '#FFC078', edu: '#B49BFF',
  social: '#FF9CC2', finance: '#FFE066', creative: '#FF9F8A', travel: '#7BE3D3',
  home: '#C4B7A6', media: '#E89BFF', devtools: '#83D4FF', science: '#9DEFE8',
  civic: '#FFB199', climate: '#7AD79C', safety: '#FF8A8A', pets: '#F5C77E',
  fitness: '#A8E892', fashion: '#F198C9', hardware: '#9FB1FF', ai: '#C19CFF',
};
function categoryColor(cat: string) {
  const key = cat.toLowerCase().trim();
  if (COLORS[key]) return COLORS[key];
  // Stable hash → HSL with tuned saturation/lightness to match palette mood.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 60%, 70%)`;
}

function fnv1a(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pseudoLayout(cat: string, id: string) {
  const angBase = (fnv1a(cat.toLowerCase()) % 1000) / 1000 * Math.PI * 2;
  const local = fnv1a(id) / 0xffffffff;
  const angle = angBase + (local - 0.5) * 0.7;
  const radius = 380 + Math.cos(local * Math.PI * 2) * 80;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function useTournament() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let lastMessageAt = Date.now();
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      const es = new EventSource('/api/events');
      esRef.current = es;
      es.onmessage = (m) => {
        lastMessageAt = Date.now();
        try {
          const parsed = JSON.parse(m.data);
          if (parsed?.type === 'ping') return;
          dispatch(parsed as Event);
        } catch { /* noop */ }
      };
      es.onerror = () => {
        try { es.close(); } catch { /* ignore */ }
        if (!cancelled) setTimeout(open, 1000);
      };
    };
    open();

    // Watchdog: server emits keepalive comments every 15s. If we see no message
    // (event OR comment doesn't reach onmessage; comments are silent client-side)
    // for 30s, force-reopen — this catches the proxy-held-zombie case.
    const watchdog = setInterval(() => {
      if (Date.now() - lastMessageAt > 30000) {
        try { esRef.current?.close(); } catch { /* ignore */ }
        lastMessageAt = Date.now();
        open();
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(watchdog);
      try { esRef.current?.close(); } catch { /* ignore */ }
    };
  }, []);

  const start = async (opts?: { ideaCount?: number; judgesPerIdea?: number; swissRounds?: number; finalists?: number; rngSeed?: number; cinematic?: boolean; streamMode?: boolean; mock?: boolean; duelMs?: number; lingerMs?: number; models?: { generator: string; judge: string; deepJudge: string; taunt: string } }) => {
    await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts ?? {}),
    });
  };

  /** Hydrate state from a stored tournament's event log. Stops live SSE while viewing history. */
  const loadHistorical = async (id: string) => {
    const res = await fetch(`/api/tournaments/${id}/events`);
    const json = await res.json() as { events: Event[] };
    // tear down SSE so live events don't bleed into the historical view
    try { esRef.current?.close(); } catch { /* ignore */ }
    dispatch({ type: 'tournament:start', tournamentId: id, targetCount: 0, ts: Date.now() } as Event);
    for (const ev of json.events) dispatch(ev);
  };

  /** Reconnect to live SSE (called when user clicks "live" after viewing history). */
  const goLive = () => {
    try { esRef.current?.close(); } catch { /* ignore */ }
    const es = new EventSource('/api/events');
    esRef.current = es;
    es.onmessage = (m) => {
      try {
        const parsed = JSON.parse(m.data);
        if (parsed?.type === 'ping') return;
        dispatch(parsed as Event);
      } catch { /* noop */ }
    };
    es.onerror = () => {};
    dispatch({ type: 'tournament:start', tournamentId: 'live', targetCount: 0, ts: Date.now() } as Event);
  };

  return { state, start, loadHistorical, goLive };
}

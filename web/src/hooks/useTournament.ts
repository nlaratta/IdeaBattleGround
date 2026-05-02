import { useEffect, useReducer, useRef } from 'react';
import type { Event, IdeaState, RoundPhase } from '../types';

interface PairFlash {
  winnerId: string;
  loserId: string;
  reason: string;
  ts: number;
}

interface State {
  phase: RoundPhase;
  round: number;
  ideas: Record<string, IdeaState>;
  pairFlashes: PairFlash[]; // recent — used for visual pulses
  champions: string[];
  log: { level: string; msg: string; ts: number }[];
  ticker: { msg: string; ts: number; kind: string }[];
  totalIdeas: number;
  aliveCount: number;
  startedAt: number | null;
  recentEloDeltas: { ideaId: string; delta: number; ts: number }[];
}

const initialState: State = {
  phase: 'idle',
  round: 0,
  ideas: {},
  pairFlashes: [],
  champions: [],
  log: [],
  ticker: [],
  totalIdeas: 0,
  aliveCount: 0,
  startedAt: null,
  recentEloDeltas: [],
};

function reducer(state: State, ev: Event): State {
  switch (ev.type) {
    case 'tournament:start':
      return { ...initialState, startedAt: ev.ts, totalIdeas: 0 };
    case 'phase:change':
      return { ...state, phase: ev.phase, ticker: pushTicker(state.ticker, `phase: ${ev.phase}`, 'phase', ev.ts) };
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
      return {
        ...state,
        aliveCount: Math.max(0, state.aliveCount - 1),
        ideas: { ...state.ideas, [ev.ideaId]: { ...s, alive: false, killedInRound: ev.round } },
        ticker: pushTicker(state.ticker, `${s.idea.pitch} eliminated (${ev.reason})`, 'kill', ev.ts),
      };
    }
    case 'pairwise:result': {
      const w = state.ideas[ev.winnerId];
      const l = state.ideas[ev.loserId];
      const ideas = { ...state.ideas };
      if (w) ideas[w.idea.id] = { ...w, elo: w.elo + ev.eloDelta, wins: w.wins + 1 };
      if (l) ideas[l.idea.id] = { ...l, elo: l.elo - ev.eloDelta, losses: l.losses + 1 };
      const flash: PairFlash = { winnerId: ev.winnerId, loserId: ev.loserId, reason: ev.reason, ts: ev.ts };
      const pairFlashes = [...state.pairFlashes, flash].slice(-50);
      const recentEloDeltas = [
        { ideaId: ev.winnerId, delta: ev.eloDelta, ts: ev.ts },
        { ideaId: ev.loserId, delta: -ev.eloDelta, ts: ev.ts },
        ...state.recentEloDeltas,
      ].slice(0, 30);
      return {
        ...state,
        ideas,
        pairFlashes,
        recentEloDeltas,
        ticker: pushTicker(state.ticker, `${w?.idea.pitch ?? '?'} beat ${l?.idea.pitch ?? '?'} — ${ev.reason}`, 'duel', ev.ts),
      };
    }
    case 'champion':
      return {
        ...state,
        champions: [...state.champions, ev.ideaId],
        ticker: pushTicker(state.ticker, `🏆 champion: ${state.ideas[ev.ideaId]?.idea.pitch ?? ev.ideaId}`, 'champ', ev.ts),
      };
    case 'tournament:complete':
      return { ...state, ticker: pushTicker(state.ticker, 'tournament complete', 'done', ev.ts) };
    case 'log':
      return { ...state, log: [...state.log, { level: ev.level, msg: ev.msg, ts: ev.ts }].slice(-100) };
  }
}

function pushTicker(prev: State['ticker'], msg: string, kind: string, ts: number) {
  return [...prev, { msg, kind, ts }].slice(-60);
}

const COLORS: Record<string, string> = {
  productivity: '#7CC4FF', health: '#86E2A2', food: '#FFC078', edu: '#B49BFF',
  social: '#FF9CC2', finance: '#FFE066', creative: '#FF9F8A', travel: '#7BE3D3',
  home: '#C4B7A6', media: '#E89BFF', devtools: '#83D4FF', science: '#9DEFE8',
  civic: '#FFB199', climate: '#7AD79C', safety: '#FF8A8A', pets: '#F5C77E',
  fitness: '#A8E892', fashion: '#F198C9', hardware: '#9FB1FF', ai: '#C19CFF',
};
function categoryColor(cat: string) {
  return COLORS[cat.toLowerCase()] ?? '#B0B0B0';
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

  const start = async (opts?: { ideaCount?: number; judgesPerIdea?: number; swissRounds?: number; finalists?: number; rngSeed?: number }) => {
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

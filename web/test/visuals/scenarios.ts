import type { Event } from '../../src/types';

export interface Scenario {
  name: string;
  description: string;
  /** Compute event index to seek to. undefined = full replay. */
  pickIdx?: (events: Event[]) => number | undefined;
  /** Selectors/buttons to click before the screenshot. */
  preClicks?: string[];
  /** Extra settle time after navigation/clicks. */
  settleMs?: number;
}

const idxOfFirst = (events: Event[], type: Event['type'], skip = 0): number => {
  let seen = 0;
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === type) {
      if (seen === skip) return i;
      seen++;
    }
  }
  return -1;
};

const idxOfLast = (events: Event[], type: Event['type']): number => {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === type) return i;
  }
  return -1;
};

export const SCENARIOS: Scenario[] = [
  {
    name: '01-idle',
    description: 'Empty home screen, controls visible',
    pickIdx: () => 0,
    settleMs: 1500,
  },
  {
    name: '02-generation-mid',
    description: 'Mid-generation: ~30% of ideas have appeared',
    pickIdx: (e) => {
      const last = idxOfLast(e, 'idea:generated');
      const first = idxOfFirst(e, 'idea:generated');
      if (last < 0 || first < 0) return undefined;
      return first + Math.floor((last - first) * 0.3);
    },
    settleMs: 1500,
  },
  {
    name: '03-generation-done',
    description: 'All ideas generated, before rubric scoring',
    pickIdx: (e) => {
      const last = idxOfLast(e, 'idea:generated');
      return last >= 0 ? last + 1 : undefined;
    },
    settleMs: 1500,
  },
  {
    name: '04-rubric-mid',
    description: 'Half the rubric scores in',
    pickIdx: (e) => {
      const first = idxOfFirst(e, 'idea:scored');
      const last = idxOfLast(e, 'idea:scored');
      if (first < 0 || last < 0) return undefined;
      return first + Math.floor((last - first) * 0.5);
    },
    settleMs: 1500,
  },
  {
    name: '05-cull-mid',
    description: 'Cull cascade — half the kills processed',
    pickIdx: (e) => {
      // First idea:killed of the rubric-cull batch
      const culls: number[] = [];
      for (let i = 0; i < e.length; i++) {
        const ev = e[i];
        if (ev.type === 'idea:killed' && ev.reason === 'rubric-cull') culls.push(i);
      }
      if (culls.length === 0) return undefined;
      return culls[Math.floor(culls.length * 0.6)];
    },
    settleMs: 1500,
  },
  {
    name: '06-pairwise-approach',
    description: 'Mid-duel approach: duel:start fired, no result yet',
    pickIdx: (e) => {
      const idx = idxOfFirst(e, 'duel:start');
      // Stop right after duel:start (and possibly the taunt) but before the result
      if (idx < 0) return undefined;
      // Include taunt if it came in before result
      let cursor = idx + 1;
      if (cursor < e.length && e[cursor].type === 'duel:taunt') cursor++;
      return cursor;
    },
    settleMs: 1500,
  },
  {
    name: '07-pairwise-result',
    description: 'Just after first pairwise:result — winner reveal linger',
    pickIdx: (e) => {
      const idx = idxOfFirst(e, 'pairwise:result');
      return idx >= 0 ? idx + 1 : undefined;
    },
    settleMs: 1500,
  },
  {
    name: '08-pairwise-late',
    description: 'Late in pairwise, several results in',
    pickIdx: (e) => {
      // Find 4th pairwise:result if it exists
      let count = 0;
      for (let i = 0; i < e.length; i++) {
        if (e[i].type === 'pairwise:result') {
          count++;
          if (count === 4) return i + 1;
        }
      }
      // Fallback to last pairwise:result
      const last = idxOfLast(e, 'pairwise:result');
      return last >= 0 ? last + 1 : undefined;
    },
    settleMs: 1500,
  },
  {
    name: '09-deep-phase',
    description: 'Deep judgment phase — finalists, no champions yet',
    pickIdx: (e) => {
      for (let i = 0; i < e.length; i++) {
        const ev = e[i];
        if (ev.type === 'phase:change' && ev.phase === 'deep') return i + 1;
      }
      return undefined;
    },
    settleMs: 1500,
  },
  {
    name: '10-complete',
    description: 'Tournament complete — all events including champions',
    pickIdx: (e) => e.length,
    settleMs: 2200, // let the champion reveal start
  },
  {
    name: '11-tree-view',
    description: 'Tree view — full bracket with all rounds',
    pickIdx: (e) => e.length,
    preClicks: ['button:has-text("tree")'],
    settleMs: 1500,
  },
  {
    name: '12-orbital-view',
    description: 'Legacy orbital view',
    pickIdx: (e) => e.length,
    preClicks: ['button:has-text("orbital")'],
    settleMs: 1500,
  },
];

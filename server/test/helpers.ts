import type { Idea, IdeaState } from '../src/types.js';
import { INITIAL_ELO } from '../src/judging/elo.js';

export function makeIdea(id: string, pitch: string, mechanism = `mechanism for ${pitch}`, targetUser = 'someone'): Idea {
  return {
    id, pitch, mechanism, targetUser,
    whyNow: 'now', biggestRisk: 'risk', category: 'test', tags: [],
    cell: {} as Idea['cell'], generation: 0, createdAt: 0,
  };
}

export function makeState(id: string, elo = INITIAL_ELO, meanScore = 0): IdeaState {
  return {
    idea: makeIdea(id, `pitch ${id}`),
    scores: [], meanScore, elo, wins: 0, losses: 0, alive: true,
    position: { x: 0, y: 0 }, color: '#fff',
  };
}

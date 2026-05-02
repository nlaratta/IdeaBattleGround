// Mirror of server types — keep in sync.

export interface SamplingCell {
  domain: string;
  audience: string;
  businessModel: string;
  constraint: string;
  timeHorizon: string;
  vibe: string;
  persona: string;
  seedWords: string[];
}

export interface Idea {
  id: string;
  pitch: string;
  mechanism: string;
  targetUser: string;
  whyNow: string;
  biggestRisk: string;
  category: string;
  tags: string[];
  cell: SamplingCell;
  parents?: string[];
  generation: number;
  createdAt: number;
}

export interface RubricScore {
  novelty: number;
  feasibility: number;
  market: number;
  weirdness: number;
  buildability: number;
  critique: string;
  total: number;
}

export interface IdeaState {
  idea: Idea;
  scores: RubricScore[];
  meanScore: number;
  elo: number;
  wins: number;
  losses: number;
  alive: boolean;
  killedInRound?: number;
  position: { x: number; y: number };
  color: string;
}

export type RoundPhase =
  | 'idle'
  | 'generating'
  | 'rubric'
  | 'culling'
  | 'pairwise'
  | 'deep'
  | 'complete';

export type Event =
  | { type: 'tournament:start'; tournamentId: string; targetCount: number; ts: number }
  | { type: 'phase:change'; phase: RoundPhase; ts: number }
  | { type: 'idea:generated'; idea: Idea; ts: number }
  | { type: 'idea:scored'; ideaId: string; score: RubricScore; ts: number }
  | { type: 'idea:killed'; ideaId: string; reason: string; round: number; ts: number }
  | { type: 'pairwise:result'; winnerId: string; loserId: string; reason: string; eloDelta: number; ts: number }
  | { type: 'champion'; ideaId: string; finalElo: number; ts: number }
  | { type: 'tournament:complete'; tournamentId: string; ts: number }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; msg: string; ts: number };

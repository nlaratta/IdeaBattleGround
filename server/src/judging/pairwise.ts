import { z } from 'zod';
import type { IdeaState } from '../types.js';
import { getLlm } from '../llm/factory.js';
import { updateElo } from './elo.js';
import { mapWithLimit } from '../util/concurrent.js';
import { config } from '../config.js';
import type { EventBus } from '../events/bus.js';

export const PAIRWISE_SYSTEM = `You are PAIRWISE_JUDGE in an idea tournament. You compare two ideas and pick the better one.

Output a JSON object only:
- winner: "A" or "B"
- reason: one short sentence (under 200 chars) explaining why

Rules:
- Be decisive. Coin-flip ties are not allowed; pick the marginally better one.
- Reward specificity, novelty, and demonstrated craft.
- Penalize generic SaaS-isms and motherhood statements.
- Output JSON only.`;

const verdictSchema = z.object({
  winner: z.union([z.literal('A'), z.literal('B')]),
  reason: z.string().min(1).max(400),
});

function buildPairPrompt(a: IdeaState, b: IdeaState): string {
  const desc = (s: IdeaState) => `pitch: ${s.idea.pitch}\nmechanism: ${s.idea.mechanism}\ntargetUser: ${s.idea.targetUser}\nwhyNow: ${s.idea.whyNow}\nbiggestRisk: ${s.idea.biggestRisk}`;
  return [
    'Idea A:',
    desc(a),
    '',
    'Idea B:',
    desc(b),
    '',
    'Which is better? Return only JSON.',
  ].join('\n');
}

interface PairResult {
  winnerId: string;
  loserId: string;
  reason: string;
  eloDelta: number;
}

export async function judgePair(a: IdeaState, b: IdeaState, bus: EventBus, opts?: { silent?: boolean; model?: string }): Promise<PairResult | null> {
  const llm = getLlm();
  try {
    const res = await llm.call({
      systemPrompt: PAIRWISE_SYSTEM,
      userPrompt: buildPairPrompt(a, b),
      retries: 1,
      model: opts?.model,
    });
    const parsed = verdictSchema.safeParse(res.data);
    if (!parsed.success) return null;
    const aWon = parsed.data.winner === 'A';
    const winner = aWon ? a : b;
    const loser = aWon ? b : a;
    const { newA, newB, delta } = updateElo(winner.elo, loser.elo, 1);
    winner.elo = newA;
    loser.elo = newB;
    winner.wins += 1;
    loser.losses += 1;
    const out = { winnerId: winner.idea.id, loserId: loser.idea.id, reason: parsed.data.reason, eloDelta: delta };
    if (!opts?.silent) bus.emit({ type: 'pairwise:result', ...out, ts: Date.now() });
    return out;
  } catch {
    return null;
  }
}

// Exported version for cinematic runs: judges silently so the runner can
// emit pairwise:result on its own pacing (after the duel animation window).
export async function judgePairSilent(
  a: IdeaState,
  b: IdeaState,
  bus: EventBus,
  model?: string,
): Promise<PairResult | null> {
  return judgePair(a, b, bus, { silent: true, model });
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Generate Swiss-style pairings for one round: walk the field in descending
 * Elo order and pair each idea with the closest-rated opponent it has not
 * already played. If every remaining opponent is a rematch, fall back to the
 * closest one. An odd field leaves the lowest-rated unpaired idea with a bye.
 * Pass the same `played` set across rounds; it is updated with the new pairs.
 */
export function pairSwiss(states: IdeaState[], played: Set<string> = new Set()): Array<[IdeaState, IdeaState]> {
  const pool = [...states].sort((x, y) => y.elo - x.elo);
  const pairs: Array<[IdeaState, IdeaState]> = [];
  while (pool.length >= 2) {
    const a = pool.shift()!;
    let idx = pool.findIndex((b) => !played.has(pairKey(a.idea.id, b.idea.id)));
    if (idx === -1) idx = 0;
    const [b] = pool.splice(idx, 1);
    played.add(pairKey(a.idea.id, b.idea.id));
    pairs.push([a, b]);
  }
  return pairs;
}

export async function runSwissRound(states: IdeaState[], bus: EventBus, model?: string, played?: Set<string>): Promise<PairResult[]> {
  const pairs = pairSwiss(states, played);
  const results = await mapWithLimit(pairs, config.judgingConcurrency, ([a, b]) => judgePair(a, b, bus, { model }));
  return results.filter((r): r is PairResult => r !== null);
}

export async function runSwissTournament(
  states: IdeaState[],
  rounds: number,
  bus: EventBus,
  model?: string,
): Promise<void> {
  const played = new Set<string>();
  for (let r = 0; r < rounds; r++) {
    await runSwissRound(states, bus, model, played);
  }
}

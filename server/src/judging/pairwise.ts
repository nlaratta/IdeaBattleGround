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

async function judgePair(a: IdeaState, b: IdeaState, bus: EventBus): Promise<PairResult | null> {
  const llm = getLlm();
  try {
    const res = await llm.call({
      systemPrompt: PAIRWISE_SYSTEM,
      userPrompt: buildPairPrompt(a, b),
      retries: 1,
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
    bus.emit({ type: 'pairwise:result', ...out, ts: Date.now() });
    return out;
  } catch {
    return null;
  }
}

/** Generate Swiss-style pairings for one round. Pair adjacent in sorted-by-elo order, alternating to avoid same-as-last. */
function pairSwiss(states: IdeaState[]): Array<[IdeaState, IdeaState]> {
  const sorted = [...states].sort((x, y) => y.elo - x.elo);
  const pairs: Array<[IdeaState, IdeaState]> = [];
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    pairs.push([sorted[i], sorted[i + 1]]);
  }
  return pairs;
}

export async function runSwissRound(states: IdeaState[], bus: EventBus): Promise<PairResult[]> {
  const pairs = pairSwiss(states);
  const results = await mapWithLimit(pairs, config.judgingConcurrency, ([a, b]) => judgePair(a, b, bus));
  return results.filter((r): r is PairResult => r !== null);
}

export async function runSwissTournament(
  states: IdeaState[],
  rounds: number,
  bus: EventBus,
): Promise<void> {
  for (let r = 0; r < rounds; r++) {
    await runSwissRound(states, bus);
  }
}

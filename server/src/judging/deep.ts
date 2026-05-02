import { z } from 'zod';
import type { IdeaState } from '../types.js';
import { getLlm } from '../llm/factory.js';
import { config } from '../config.js';

export const DEEP_SYSTEM = `You are DEEP_JUDGE, the final arbiter of finalist ideas. Write a sharp critique, then deliver a verdict.

Output JSON only:
- strongestPoint: one sentence
- fatalFlaw: one sentence (be honest; if there isn't one, say "no fatal flaw, but..." and explain the next biggest concern)
- verdict: "advance" or "eliminate"
- score: number 0-10 (final composite)

Rules:
- Output JSON only. No prose.
- Reward ideas that would make compelling streaming content if built live.`;

const verdictSchema = z.object({
  strongestPoint: z.string().min(1),
  fatalFlaw: z.string().min(1),
  verdict: z.union([z.literal('advance'), z.literal('eliminate')]),
  score: z.number().min(0).max(10),
});

export type DeepVerdict = z.infer<typeof verdictSchema>;

export async function deepReview(state: IdeaState): Promise<DeepVerdict | null> {
  const llm = getLlm();
  const idea = state.idea;
  try {
    const res = await llm.call({
      systemPrompt: DEEP_SYSTEM,
      userPrompt: [
        'Final-round review of:',
        `- pitch: ${idea.pitch}`,
        `- mechanism: ${idea.mechanism}`,
        `- targetUser: ${idea.targetUser}`,
        `- whyNow: ${idea.whyNow}`,
        `- biggestRisk: ${idea.biggestRisk}`,
        `- category: ${idea.category}`,
        `- current Elo: ${state.elo.toFixed(0)}`,
        `- mean rubric score: ${state.meanScore.toFixed(2)}`,
        'Return only JSON.',
      ].join('\n'),
      retries: 1,
      model: config.deepJudgeModel,
    });
    const parsed = verdictSchema.safeParse(res.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

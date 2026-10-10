import { z } from 'zod';
import type { Idea, RubricScore } from '../types.js';
import { getLlm } from '../llm/factory.js';
import { mapWithLimit } from '../util/concurrent.js';
import { config } from '../config.js';
import type { EventBus } from '../events/bus.js';

export const RUBRIC_SYSTEM = `You are RUBRIC_JUDGE, evaluating ideas in a tournament. You must FIRST write a one-sentence honest critique, then assign numeric scores.

Output a JSON object only with these keys (no prose, no fences):
- critique: one sentence (max 200 chars) describing the idea's strongest tension or weakness
- novelty: number 1-10 (10 = genuinely surprising)
- feasibility: number 1-10 (10 = could be built today by a small team)
- market: number 1-10 (10 = clear demand and willingness to pay)
- weirdness: number 1-10 (10 = strange in a memorable, generative way)
- buildability: number 1-10 (how watchable is this if built live on stream — favors visible UI, fast loops)

Rules:
- Score honestly. Do not inflate.
- Use the full range. A median idea is a 5, not a 7.
- Output JSON only.`;

const scoreSchema = z.object({
  critique: z.string().min(1).max(400),
  novelty: z.number().min(0).max(10),
  feasibility: z.number().min(0).max(10),
  market: z.number().min(0).max(10),
  weirdness: z.number().min(0).max(10),
  buildability: z.number().min(0).max(10),
});

function buildUserPrompt(idea: Idea): string {
  return [
    'Score this idea:',
    `- pitch: ${idea.pitch}`,
    `- mechanism: ${idea.mechanism}`,
    `- targetUser: ${idea.targetUser}`,
    `- whyNow: ${idea.whyNow}`,
    `- biggestRisk: ${idea.biggestRisk}`,
    `- category: ${idea.category}`,
    'Return only JSON.',
  ].join('\n');
}

export async function scoreIdea(idea: Idea, judgeIndex: number, model?: string): Promise<RubricScore | null> {
  const llm = getLlm();
  // Slight variation between judges via tag in system prompt
  const sysWithJudge = `${RUBRIC_SYSTEM}\n\nYou are judge #${judgeIndex + 1}. Be honest but use the persona's normal voice.`;
  try {
    const res = await llm.call({
      systemPrompt: sysWithJudge,
      userPrompt: buildUserPrompt(idea),
      retries: 1,
      model,
    });
    const parsed = scoreSchema.safeParse(res.data);
    if (!parsed.success) return null;
    const s = parsed.data;
    const total = (s.novelty + s.feasibility + s.market + s.weirdness + s.buildability) / 5;
    return { ...s, total };
  } catch {
    return null;
  }
}

export async function scoreAllIdeas(
  ideas: Idea[],
  judgesPerIdea: number,
  bus: EventBus,
  model?: string,
): Promise<Record<string, RubricScore[]>> {
  const tasks: Array<{ idea: Idea; judge: number }> = [];
  for (const idea of ideas) {
    for (let j = 0; j < judgesPerIdea; j++) tasks.push({ idea, judge: j });
  }
  const results = await mapWithLimit(tasks, config.judgingConcurrency, async ({ idea, judge }) => {
    const score = await scoreIdea(idea, judge, model);
    if (score) bus.emit({ type: 'idea:scored', ideaId: idea.id, score, ts: Date.now() });
    return { idea, score };
  });
  const byId: Record<string, RubricScore[]> = {};
  for (const { idea, score } of results) {
    if (!score) continue;
    (byId[idea.id] ||= []).push(score);
  }
  return byId;
}

/** Mean of the judges' totals; 0 when every judge call failed (avoids NaN poisoning sorts). */
export function meanTotal(scores: Array<{ total: number }>): number {
  return scores.length === 0 ? 0 : scores.reduce((a, b) => a + b.total, 0) / scores.length;
}

/** Rubric cull: keep the top 40% by mean score, but never fewer than `finalists`. */
export function selectRubricSurvivors<T extends { meanScore: number }>(states: T[], finalists: number): T[] {
  const sorted = [...states].sort((a, b) => b.meanScore - a.meanScore);
  const cutoff = Math.max(finalists, Math.ceil(sorted.length * 0.4));
  return sorted.slice(0, cutoff);
}

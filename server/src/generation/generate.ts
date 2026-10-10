import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Idea, SamplingCell } from '../types.js';
import { getLlm } from '../llm/factory.js';
import { GENERATOR_SYSTEM, buildGeneratorUserPrompt } from './prompts.js';
import { mapWithLimit } from '../util/concurrent.js';
import { config } from '../config.js';
import { buildMatrix, type MatrixOverrides } from './matrix.js';
import type { EventBus } from '../events/bus.js';

const ideaSchema = z.object({
  pitch: z.string().min(2).max(120),
  mechanism: z.string().min(2),
  targetUser: z.string().min(2),
  whyNow: z.string().min(2),
  biggestRisk: z.string().min(2),
  category: z.string().min(1),
  tags: z.array(z.string()).max(8).default([]),
});

async function generateOne(cell: SamplingCell, model?: string, themeNote?: string, extraConstraints?: string): Promise<Idea | null> {
  const llm = getLlm();
  try {
    const res = await llm.call({
      systemPrompt: GENERATOR_SYSTEM,
      userPrompt: buildGeneratorUserPrompt(cell, themeNote, extraConstraints),
      retries: 1,
      model,
    });
    const parsed = ideaSchema.safeParse(res.data);
    if (!parsed.success) return null;
    const data = parsed.data;
    return {
      id: nanoid(10),
      pitch: data.pitch,
      mechanism: data.mechanism,
      targetUser: data.targetUser,
      whyNow: data.whyNow,
      biggestRisk: data.biggestRisk,
      category: data.category.toLowerCase().trim(),
      tags: data.tags,
      cell,
      generation: 0,
      createdAt: Date.now(),
    };
  } catch (e) {
    console.warn(`[generate] idea call failed: ${(e as Error).message}`);
    return null;
  }
}

export async function generateIdeas(
  count: number,
  bus: EventBus,
  rngSeed?: number,
  model?: string,
  overrides?: MatrixOverrides,
  themeNote?: string,
  extraConstraints?: string,
): Promise<Idea[]> {
  const cells = buildMatrix({ count, rngSeed, overrides });
  const results = await mapWithLimit(cells, config.generationConcurrency, async (cell) => {
    const idea = await generateOne(cell, model, themeNote, extraConstraints);
    if (idea) bus.emit({ type: 'idea:generated', idea, ts: Date.now() });
    return idea;
  });
  return results.filter((x): x is Idea => x !== null);
}

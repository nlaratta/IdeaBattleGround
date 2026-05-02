import { z } from 'zod';
import type { IdeaState } from '../types.js';
import { getLlm } from '../llm/factory.js';

export const TAUNT_SYSTEM = `You are TAUNT_NARRATOR, a sports announcer for an AI idea tournament. Two ideas are about to duel. Output ONE short sentence (under 18 words) that frames the matchup with personality — not summary. Reference both pitches by name. Be punchy. No hedging.

Output JSON only:
- quote: string`;

const schema = z.object({ quote: z.string().min(2).max(200) });

const MOCK_TEMPLATES = [
  '%A% steps into the ring against %B% — and only one walks out.',
  'It\'s %A% versus %B%. Who blinks first?',
  '%A% has the lore; %B% has the receipts. Fight.',
  'Tonight: %A% defends, %B% dares. Loser goes home.',
  'They said it would never come to this. %A%. %B%. Here we are.',
  '%A% claims feasibility, %B% bets on weirdness. Judge\'s call.',
  '%A% vs %B% — the clash everyone whispered about.',
  'No quarter: %A% and %B% have spent their last polite turn.',
  '%A%, the methodical. %B%, the unhinged. Survive or be archived.',
];

export async function generateTaunt(a: IdeaState, b: IdeaState, _mock: boolean, model?: string): Promise<string | null> {
  // Always go through the LLM provider — MockProvider knows how to serve a
  // taunt with templates, AgentSdkProvider hits the configured model. The
  // runner-side `mock` flag is informational; the active provider already
  // reflects mock-vs-live.
  try {
    const llm = getLlm();
    const userText = `Idea A: ${a.idea.pitch} — ${a.idea.mechanism}\nIdea B: ${b.idea.pitch} — ${b.idea.mechanism}\nReturn only JSON.`;
    const res = await llm.call({
      systemPrompt: TAUNT_SYSTEM,
      userPrompt: userText,
      retries: 1,
      model: model ?? 'haiku',
    });
    const parsed = schema.safeParse(res.data);
    if (parsed.success) {
      // If the mock returned a generic template, splice in the pitches for variety.
      const tpl = MOCK_TEMPLATES[Math.floor(Math.random() * MOCK_TEMPLATES.length)];
      const fallback = tpl.replace('%A%', a.idea.pitch).replace('%B%', b.idea.pitch);
      // Prefer model output unless it lacks both names (likely templated).
      const q = parsed.data.quote;
      const mentionsA = q.toLowerCase().includes(a.idea.pitch.toLowerCase().split(' ')[0].toLowerCase());
      const mentionsB = q.toLowerCase().includes(b.idea.pitch.toLowerCase().split(' ')[0].toLowerCase());
      return mentionsA || mentionsB ? q : fallback;
    }
    return null;
  } catch {
    return null;
  }
}

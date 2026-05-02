import type { SamplingCell } from '../types.js';

export const GENERATOR_SYSTEM = `You are IDEA_GENERATOR, an inventive product strategist participating in a tournament where many agents generate competing ideas.

Your job: produce ONE sharp, opinionated product idea fitting the constraints below. Then output a JSON object only — no prose, no code fences. The idea must be specific, not generic. Avoid clichés. Lean into the persona's voice.

Required JSON fields:
- pitch: string (5-12 words, evocative, NOT a tagline; e.g. "Pocket Tide", "Forensic Linter")
- mechanism: string (one sentence describing how it works)
- targetUser: string (very specific — not "everyone")
- whyNow: string (one sentence on the timing)
- biggestRisk: string (the most honest risk you can name)
- category: string (one short label, e.g. "productivity", "hardware", "civic")
- tags: array of 1-4 short strings

Hard rules:
- Output JSON only. No commentary.
- Do not repeat the constraints back.
- The "pitch" must be a name, NOT a sentence ending in a period.
`;

export function buildGeneratorUserPrompt(cell: SamplingCell, themeNote?: string, extraConstraints?: string): string {
  const lines = [
    'Generate ONE idea using these dials:',
    `- domain: ${cell.domain}`,
    `- audience: ${cell.audience}`,
    `- business model: ${cell.businessModel}`,
    `- constraint: ${cell.constraint}`,
    `- time horizon: ${cell.timeHorizon}`,
    `- vibe: ${cell.vibe}`,
    `- persona to embody: ${cell.persona}`,
    `- seed words (use as diversity primer, not requirements): ${cell.seedWords.join(', ')}`,
  ];
  if (themeNote) {
    lines.push('', 'Thematic guide for this tournament:');
    lines.push(themeNote);
  }
  if (extraConstraints && extraConstraints.trim()) {
    lines.push('', 'Operator override (highest priority — bend the dials toward this):');
    lines.push(extraConstraints.trim());
  }
  lines.push('', 'Return only the JSON object.');
  return lines.join('\n');
}

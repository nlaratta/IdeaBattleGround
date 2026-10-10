// One-call check of the configured LLM provider (mock or live, per MOCK_MODE).
//   MOCK_MODE=false npm --workspace server run smoke:llm
import { getLlm } from '../src/llm/factory.js';
import { config } from '../src/config.js';

console.log(`provider: ${config.mockMode ? 'mock' : 'live (Claude Agent SDK)'}, model: ${config.judgeModel}`);
const t0 = Date.now();
const res = await getLlm().call({
  systemPrompt: 'You are PAIRWISE_JUDGE. Reply with JSON only: {"winner":"A"|"B","reason":"short"}',
  userPrompt: 'Idea A: a sundial. Idea B: a sundial that texts you. Which is better? Return only JSON.',
  model: config.judgeModel,
  retries: 0,
});
console.log(`ok in ${Date.now() - t0}ms:`, res.data);

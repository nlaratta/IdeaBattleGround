import { config } from '../config.js';
import type { LlmProvider } from './index.js';
import { MockProvider } from './mock.js';
import { AgentSdkProvider } from './agent-sdk.js';

let cached: LlmProvider | null = null;

export function getLlm(): LlmProvider {
  if (cached) return cached;
  cached = config.mockMode
    ? new MockProvider()
    : new AgentSdkProvider(config.generatorModel);
  return cached;
}

export function resetLlmForTests() { cached = null; }

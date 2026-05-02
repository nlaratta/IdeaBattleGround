import { config } from '../config.js';
import type { LlmProvider } from './index.js';
import { MockProvider } from './mock.js';
import { AgentSdkProvider } from './agent-sdk.js';

let cached: LlmProvider | null = null;
let mockOverride: boolean | null = null;

export function getLlm(): LlmProvider {
  const wantMock = mockOverride ?? config.mockMode;
  if (cached && (cached instanceof MockProvider) === wantMock) return cached;
  cached = wantMock
    ? new MockProvider()
    : new AgentSdkProvider(config.generatorModel);
  return cached;
}

/** Set the desired provider mode for the next call to getLlm(). null = follow env. */
export function setMockOverride(v: boolean | null) {
  mockOverride = v;
  cached = null;
}

export function resetLlmForTests() { cached = null; mockOverride = null; }

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { LlmCall, LlmProvider, LlmResult } from './index.js';
import { extractJson } from '../util/json.js';

const MODEL_ALIASES: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
  haiku: 'claude-haiku-4-5-20251001',
};

function resolveModel(m?: string) {
  if (!m) return MODEL_ALIASES.sonnet;
  return MODEL_ALIASES[m] ?? m;
}

export class AgentSdkProvider implements LlmProvider {
  constructor(private readonly defaultModel: string = 'sonnet') {}

  async call<T = unknown>(req: LlmCall): Promise<LlmResult<T>> {
    const model = resolveModel(req.model ?? this.defaultModel);
    const retries = req.retries ?? 1;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await this.runOnce(model, req.systemPrompt, req.userPrompt);
        const data = extractJson<T>(text);
        return { data, raw: text };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('LLM call failed');
  }

  private async runOnce(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const q = query({
      prompt: userPrompt,
      options: {
        model,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPrompt },
        allowedTools: [],
        permissionMode: 'bypassPermissions',
      },
    });

    const chunks: string[] = [];
    for await (const message of q) {
      if (message.type === 'assistant') {
        const content = (message as { message: { content: unknown[] } }).message.content;
        for (const block of content as Array<{ type: string; text?: string }>) {
          if (block.type === 'text' && typeof block.text === 'string') {
            chunks.push(block.text);
          }
        }
      } else if (message.type === 'result') {
        // streaming complete
      }
    }
    return chunks.join('\n').trim();
  }
}

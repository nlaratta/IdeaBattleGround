import { query } from '@anthropic-ai/claude-agent-sdk';
import type { LlmCall, LlmProvider, LlmResult } from './index.js';
import { extractJson } from '../util/json.js';

// The SDK/CLI resolves the sonnet / opus / haiku aliases to the current model,
// so they are passed through unchanged; full model IDs work too.
function resolveModel(m?: string) {
  return m || 'sonnet';
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
        // Plain system prompt (not the claude_code preset) keeps each call
        // small and fast; no tools, no settings, a single turn.
        systemPrompt,
        tools: [],
        settingSources: [],
        maxTurns: 1,
        persistSession: false,
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
        const r = message as { subtype?: string; is_error?: boolean; result?: string };
        if (r.is_error || (r.subtype && r.subtype !== 'success')) {
          throw new Error(`Claude Agent SDK error (${r.subtype ?? 'unknown'}): ${r.result ?? 'no detail'}`);
        }
      }
    }
    return chunks.join('\n').trim();
  }
}

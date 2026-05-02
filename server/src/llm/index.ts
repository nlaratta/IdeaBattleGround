export interface LlmCall {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  /** Override max retries on JSON parse failure. */
  retries?: number;
}

export interface LlmResult<T> {
  data: T;
  raw: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface LlmProvider {
  /** Run a single one-shot call. Caller is responsible for prompting JSON-only output. */
  call<T = unknown>(req: LlmCall): Promise<LlmResult<T>>;
}

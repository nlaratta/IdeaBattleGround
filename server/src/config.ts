import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Try project root first, then local cwd as fallback.
loadEnv({ path: resolve(process.cwd(), '..', '.env') });
loadEnv();

export interface Config {
  port: number;
  dataDir: string;
  mockMode: boolean;
  generatorModel: string;
  judgeModel: string;
  deepJudgeModel: string;
  generationConcurrency: number;
  judgingConcurrency: number;
}

function envBool(name: string, dflt: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return dflt;
  return v === '1' || v.toLowerCase() === 'true';
}

function envNum(name: string, dflt: number): number {
  const v = process.env[name];
  if (v === undefined) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

export const config: Config = {
  port: envNum('PORT', 8787),
  dataDir: process.env.DATA_DIR ?? './data',
  mockMode: envBool('MOCK_MODE', true),
  generatorModel: process.env.GENERATOR_MODEL ?? 'sonnet',
  judgeModel: process.env.JUDGE_MODEL ?? 'sonnet',
  deepJudgeModel: process.env.DEEP_JUDGE_MODEL ?? 'opus',
  generationConcurrency: envNum('GENERATION_CONCURRENCY', 6),
  judgingConcurrency: envNum('JUDGING_CONCURRENCY', 6),
};

import express from 'express';
import { runTournament, getCurrent, isRunning } from '../runner.js';
import { globalBus } from '../events/bus.js';
import { attachSse } from '../events/sse.js';
import { config } from '../config.js';

export function buildRouter() {
  const r = express.Router();

  r.get('/api/health', (_req, res) => {
    res.json({ ok: true, mockMode: config.mockMode, running: isRunning() });
  });

  r.get('/api/state', (_req, res) => {
    const t = getCurrent();
    if (!t) return res.json({ tournament: null });
    res.json({
      tournament: {
        id: t.id,
        phase: t.phase,
        round: t.round,
        startedAt: t.startedAt,
        pairwiseRoundsRun: t.pairwiseRoundsRun,
        champions: t.champions,
        ideas: t.ideas,
      },
    });
  });

  r.get('/api/events', attachSse(globalBus));

  r.post('/api/start', express.json(), async (req, res) => {
    if (isRunning()) return res.status(409).json({ error: 'already running' });
    const opts = req.body ?? {};
    res.json({ accepted: true });
    runTournament(opts, globalBus).catch((err) => {
      globalBus.emit({ type: 'log', level: 'error', msg: `tournament error: ${(err as Error).message}`, ts: Date.now() });
    });
  });

  return r;
}

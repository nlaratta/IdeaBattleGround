import express from 'express';
import { runTournament, getCurrent, isRunning } from '../runner.js';
import { globalBus } from '../events/bus.js';
import { attachSse } from '../events/sse.js';
import { config } from '../config.js';
import { listTournaments, loadTournamentState, loadTournamentEvents } from '../db/store.js';
import { setMockOverride } from '../llm/factory.js';
import { listTemplates } from '../generation/templates.js';

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

  r.get('/api/tournaments', (_req, res) => {
    res.json({ tournaments: listTournaments() });
  });

  r.get('/api/tournaments/:id', (req, res) => {
    const state = loadTournamentState(req.params.id);
    if (!state) return res.status(404).json({ error: 'not found' });
    res.json({ tournament: state });
  });

  r.get('/api/tournaments/:id/events', (req, res) => {
    const events = loadTournamentEvents(req.params.id);
    res.json({ events });
  });

  r.get('/api/templates', (_req, res) => {
    res.json({ templates: listTemplates() });
  });

  r.post('/api/start', express.json(), async (req, res) => {
    if (isRunning()) return res.status(409).json({ error: 'already running' });
    const { mock, ...opts } = req.body ?? {};
    res.json({ accepted: true });
    // Apply per-run mock override (true/false explicitly, or undefined → follow env).
    if (typeof mock === 'boolean') setMockOverride(mock);
    else setMockOverride(null);
    runTournament(opts, globalBus).catch((err) => {
      globalBus.emit({ type: 'log', level: 'error', msg: `tournament error: ${(err as Error).message}`, ts: Date.now() });
    });
  });

  return r;
}

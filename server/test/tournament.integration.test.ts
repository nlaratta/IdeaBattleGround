import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Configure before the app modules load: mock provider, throwaway SQLite dir.
const dataDir = mkdtempSync(join(tmpdir(), 'ibg-test-'));
process.env.MOCK_MODE = 'true';
process.env.DATA_DIR = dataDir;

test('full mock tournament completes every stage with sensible output', async () => {
  const { runTournament } = await import('../src/runner.js');
  const { EventBus } = await import('../src/events/bus.js');
  const { loadTournamentState } = await import('../src/db/store.js');

  const bus = new EventBus();
  const counts: Record<string, number> = {};
  const phases: string[] = [];
  bus.subscribe((e) => {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === 'phase:change') phases.push(e.phase);
  });

  const opts = { ideaCount: 24, judgesPerIdea: 2, swissRounds: 3, finalists: 4 };
  const t = await runTournament(opts, bus);

  assert.deepEqual(phases, ['generating', 'rubric', 'culling', 'pairwise', 'deep', 'complete']);
  assert.equal(t.phase, 'complete');
  assert.equal(counts['tournament:start'], 1);
  assert.equal(counts['tournament:complete'], 1);
  assert.equal(counts['round:start'], opts.swissRounds);
  assert.ok(counts['idea:generated'] >= opts.ideaCount * 0.9, 'most ideas generated');

  const ideas = Object.values(t.ideas);
  assert.ok(ideas.length > 0 && ideas.length <= opts.ideaCount);
  assert.ok(ideas.every((i) => i.scores.length === opts.judgesPerIdea), 'every idea rubric-scored by every judge');
  assert.ok(ideas.every((i) => Number.isFinite(i.meanScore) && Number.isFinite(i.elo)));

  const alive = ideas.filter((i) => i.alive);
  assert.equal(alive.length, opts.finalists, 'exactly the finalists survive');
  assert.ok(counts['pairwise:result'] > 0);

  assert.ok(t.champions.length >= 1 && t.champions.length <= 3);
  for (const id of t.champions) assert.ok(t.ideas[id]?.alive, 'champions come from the finalists');
  assert.equal(counts['champion'], t.champions.length);

  // Elo is zero-sum around the starting rating.
  const total = ideas.reduce((a, i) => a + i.elo, 0);
  assert.ok(Math.abs(total - ideas.length * 1200) < 1e-6);

  // Everything was persisted and can be reloaded.
  const stored = loadTournamentState(t.id);
  assert.ok(stored);
  assert.equal(stored.phase, 'complete');
  assert.deepEqual(stored.champions, t.champions);
});

test.after(() => rmSync(dataDir, { recursive: true, force: true }));

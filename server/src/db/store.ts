import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';
import type { Event, Idea, IdeaState, RubricScore, TournamentState } from '../types.js';
import type { DeepVerdict } from '../judging/deep.js';

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    phase TEXT NOT NULL,
    opts_json TEXT NOT NULL,
    champions_json TEXT,
    pairwise_rounds_run INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    pitch TEXT NOT NULL,
    mechanism TEXT NOT NULL,
    target_user TEXT NOT NULL,
    why_now TEXT NOT NULL,
    biggest_risk TEXT NOT NULL,
    category TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    cell_json TEXT NOT NULL,
    generation INTEGER NOT NULL,
    parents_json TEXT,
    created_at INTEGER NOT NULL,
    elo REAL NOT NULL DEFAULT 1200,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    alive INTEGER NOT NULL DEFAULT 1,
    killed_in_round INTEGER,
    position_x REAL,
    position_y REAL,
    color TEXT,
    mean_score REAL NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ideas_tournament ON ideas(tournament_id)`,
  `CREATE TABLE IF NOT EXISTS rubric_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    judge_index INTEGER NOT NULL,
    novelty REAL NOT NULL,
    feasibility REAL NOT NULL,
    market REAL NOT NULL,
    weirdness REAL NOT NULL,
    buildability REAL NOT NULL,
    total REAL NOT NULL,
    critique TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rubric_idea ON rubric_scores(idea_id)`,
  `CREATE TABLE IF NOT EXISTS pairwise_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    winner_id TEXT NOT NULL,
    loser_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    elo_delta REAL NOT NULL,
    round INTEGER NOT NULL,
    ts INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pair_tournament ON pairwise_results(tournament_id, ts)`,
  `CREATE TABLE IF NOT EXISTS deep_verdicts (
    idea_id TEXT PRIMARY KEY REFERENCES ideas(id) ON DELETE CASCADE,
    strongest_point TEXT NOT NULL,
    fatal_flaw TEXT NOT NULL,
    verdict TEXT NOT NULL,
    score REAL NOT NULL,
    ts INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id TEXT,
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_tournament ON events(tournament_id, ts)`,
];

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = resolve(process.cwd(), '..', config.dataDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'ibg.db');
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const stmt of SCHEMA_STATEMENTS) db.prepare(stmt).run();
  return db;
}

// --- writers ---

export function insertTournament(id: string, startedAt: number, opts: object) {
  getDb().prepare(`INSERT OR REPLACE INTO tournaments (id, started_at, phase, opts_json) VALUES (?, ?, 'idle', ?)`)
    .run(id, startedAt, JSON.stringify(opts));
}

export function updateTournamentPhase(id: string, phase: string, pairwiseRoundsRun: number) {
  getDb().prepare(`UPDATE tournaments SET phase = ?, pairwise_rounds_run = ? WHERE id = ?`).run(phase, pairwiseRoundsRun, id);
}

export function completeTournament(id: string, championIds: string[], completedAt: number) {
  getDb().prepare(`UPDATE tournaments SET phase = 'complete', completed_at = ?, champions_json = ? WHERE id = ?`)
    .run(completedAt, JSON.stringify(championIds), id);
}

export function insertIdea(tournamentId: string, idea: Idea, position: { x: number; y: number }, color: string) {
  getDb().prepare(`
    INSERT OR REPLACE INTO ideas
      (id, tournament_id, pitch, mechanism, target_user, why_now, biggest_risk, category, tags_json,
       cell_json, generation, parents_json, created_at, position_x, position_y, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    idea.id, tournamentId, idea.pitch, idea.mechanism, idea.targetUser, idea.whyNow, idea.biggestRisk,
    idea.category, JSON.stringify(idea.tags), JSON.stringify(idea.cell), idea.generation,
    idea.parents ? JSON.stringify(idea.parents) : null, idea.createdAt,
    position.x, position.y, color,
  );
}

export function insertRubricScore(ideaId: string, judgeIndex: number, score: RubricScore) {
  getDb().prepare(`
    INSERT INTO rubric_scores (idea_id, judge_index, novelty, feasibility, market, weirdness, buildability, total, critique)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ideaId, judgeIndex, score.novelty, score.feasibility, score.market, score.weirdness, score.buildability, score.total, score.critique);
}

export function updateIdeaScoreSummary(ideaId: string, meanScore: number) {
  getDb().prepare(`UPDATE ideas SET mean_score = ? WHERE id = ?`).run(meanScore, ideaId);
}

export function killIdea(ideaId: string, round: number) {
  getDb().prepare(`UPDATE ideas SET alive = 0, killed_in_round = ? WHERE id = ?`).run(round, ideaId);
}

export function insertPairwise(tournamentId: string, winnerId: string, loserId: string, reason: string, eloDelta: number, round: number, ts: number) {
  getDb().prepare(`
    INSERT INTO pairwise_results (tournament_id, winner_id, loser_id, reason, elo_delta, round, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tournamentId, winnerId, loserId, reason, eloDelta, round, ts);
}

export function updateIdeaElo(ideaId: string, elo: number, wins: number, losses: number) {
  getDb().prepare(`UPDATE ideas SET elo = ?, wins = ?, losses = ? WHERE id = ?`).run(elo, wins, losses, ideaId);
}

export function insertDeepVerdict(ideaId: string, v: DeepVerdict, ts: number) {
  getDb().prepare(`
    INSERT OR REPLACE INTO deep_verdicts (idea_id, strongest_point, fatal_flaw, verdict, score, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ideaId, v.strongestPoint, v.fatalFlaw, v.verdict, v.score, ts);
}

export function insertEvent(tournamentId: string | null, e: Event) {
  getDb().prepare(`INSERT INTO events (tournament_id, ts, type, payload) VALUES (?, ?, ?, ?)`)
    .run(tournamentId, e.ts, e.type, JSON.stringify(e));
}

// Mark any tournament that was running when the process crashed.
export function markCrashed(now: number) {
  return getDb().prepare(`UPDATE tournaments SET phase = 'crashed', completed_at = ? WHERE phase NOT IN ('complete','crashed')`)
    .run(now).changes;
}

// --- readers ---

export function listTournaments(): Array<{ id: string; startedAt: number; completedAt: number | null; phase: string; ideaCount: number; championIds: string[] }> {
  const rows = getDb().prepare(`
    SELECT t.id, t.started_at, t.completed_at, t.phase, t.champions_json,
           (SELECT COUNT(*) FROM ideas WHERE tournament_id = t.id) AS idea_count
    FROM tournaments t ORDER BY t.started_at DESC LIMIT 50
  `).all() as Array<{ id: string; started_at: number; completed_at: number | null; phase: string; champions_json: string | null; idea_count: number }>;
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    phase: r.phase,
    ideaCount: r.idea_count,
    championIds: r.champions_json ? JSON.parse(r.champions_json) : [],
  }));
}

export function loadTournamentEvents(tournamentId: string): Event[] {
  const rows = getDb().prepare(`SELECT payload FROM events WHERE tournament_id = ? ORDER BY ts ASC, id ASC`)
    .all(tournamentId) as Array<{ payload: string }>;
  return rows.map((r) => JSON.parse(r.payload) as Event);
}

export function loadTournamentState(tournamentId: string): TournamentState | null {
  const t = getDb().prepare(`SELECT * FROM tournaments WHERE id = ?`).get(tournamentId) as
    | { id: string; started_at: number; phase: string; champions_json: string | null; pairwise_rounds_run: number }
    | undefined;
  if (!t) return null;

  const ideaRows = getDb().prepare(`SELECT * FROM ideas WHERE tournament_id = ?`).all(tournamentId) as Array<{
    id: string; pitch: string; mechanism: string; target_user: string; why_now: string; biggest_risk: string;
    category: string; tags_json: string; cell_json: string; generation: number; parents_json: string | null;
    created_at: number; elo: number; wins: number; losses: number; alive: number; killed_in_round: number | null;
    position_x: number; position_y: number; color: string; mean_score: number;
  }>;

  const scoreStmt = getDb().prepare(`SELECT * FROM rubric_scores WHERE idea_id = ? ORDER BY judge_index ASC`);

  const ideas: Record<string, IdeaState> = {};
  for (const r of ideaRows) {
    const scores = scoreStmt.all(r.id) as Array<{ novelty: number; feasibility: number; market: number; weirdness: number; buildability: number; total: number; critique: string }>;
    ideas[r.id] = {
      idea: {
        id: r.id,
        pitch: r.pitch,
        mechanism: r.mechanism,
        targetUser: r.target_user,
        whyNow: r.why_now,
        biggestRisk: r.biggest_risk,
        category: r.category,
        tags: JSON.parse(r.tags_json),
        cell: JSON.parse(r.cell_json),
        generation: r.generation,
        parents: r.parents_json ? JSON.parse(r.parents_json) : undefined,
        createdAt: r.created_at,
      },
      scores: scores.map((s) => ({
        novelty: s.novelty,
        feasibility: s.feasibility,
        market: s.market,
        weirdness: s.weirdness,
        buildability: s.buildability,
        total: s.total,
        critique: s.critique,
      })),
      meanScore: r.mean_score,
      elo: r.elo,
      wins: r.wins,
      losses: r.losses,
      alive: r.alive === 1,
      killedInRound: r.killed_in_round ?? undefined,
      position: { x: r.position_x, y: r.position_y },
      color: r.color,
    };
  }

  return {
    id: t.id,
    phase: t.phase as TournamentState['phase'],
    round: 0,
    startedAt: t.started_at,
    pairwiseRoundsRun: t.pairwise_rounds_run,
    champions: t.champions_json ? JSON.parse(t.champions_json) : [],
    ideas,
  };
}

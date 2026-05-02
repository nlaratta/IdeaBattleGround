import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCENARIOS } from './scenarios';
import type { Event } from '../../src/types';

const SERVER = process.env.IBG_SERVER ?? 'http://localhost:8787';
const WEB = process.env.IBG_WEB ?? 'http://localhost:5173';
const OUT_BASE = process.env.IBG_OUT ?? resolve(process.cwd(), '..', 'docs', 'screenshots');

interface Viewport { name: string; width: number; height: number; }
const VIEWPORTS: Viewport[] = [
  { name: 'broadcast-1920x1080', width: 1920, height: 1080 },
  { name: 'laptop-1366x768', width: 1366, height: 768 },
  { name: 'preview-800x600', width: 800, height: 600 },
];

interface TournamentSummary { id: string; phase: string; ideaCount: number; championIds: string[] }

async function kickStreamModeTournament(): Promise<string> {
  console.log('[ibg-visuals] no serialized tournament found — kicking a fresh mock stream-mode run');
  await fetch(`${SERVER}/api/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mock: true, streamMode: true, duelMs: 800, lingerMs: 600, ideaCount: 14, judgesPerIdea: 1, swissRounds: 2, finalists: 4 }),
  });
  // Poll for completion.
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = await fetch(`${SERVER}/api/health`);
    const h = await r.json() as { running: boolean };
    if (!h.running) break;
  }
  // The freshest tournament is the one we just kicked.
  const r = await fetch(`${SERVER}/api/tournaments`);
  const { tournaments } = await r.json() as { tournaments: TournamentSummary[] };
  return tournaments[0].id;
}

async function pickTournament(): Promise<TournamentSummary> {
  // Always kick a fresh mock stream-mode tournament so the layout, prompts,
  // and ordering match the current code (and we reliably get a serialized one).
  // Set IBG_REUSE_TOURNAMENT=<id> to skip the kick and use a known one.
  if (process.env.IBG_REUSE_TOURNAMENT) {
    const r = await fetch(`${SERVER}/api/tournaments`);
    const { tournaments } = await r.json() as { tournaments: TournamentSummary[] };
    const found = tournaments.find((t) => t.id === process.env.IBG_REUSE_TOURNAMENT);
    if (found) {
      console.log(`[ibg-visuals] reusing tournament ${found.id}`);
      return found;
    }
  }
  const newId = await kickStreamModeTournament();
  const after = await fetch(`${SERVER}/api/tournaments`).then((r) => r.json()) as { tournaments: TournamentSummary[] };
  return after.tournaments.find((t) => t.id === newId) ?? after.tournaments[0];
}

async function loadEvents(id: string): Promise<Event[]> {
  const r = await fetch(`${SERVER}/api/tournaments/${id}/events`);
  const { events } = await r.json() as { events: Event[] };
  return events;
}

async function captureScenario(page: Page, dir: string, scenarioName: string, url: string, preClicks: string[] | undefined, settleMs: number) {
  await page.goto(url);
  // Wait for app readiness marker (set after replay completes); fall back to settle timer.
  await page.waitForSelector('body[data-ibg-ready="true"]', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(settleMs);
  for (const sel of preClicks ?? []) {
    try {
      // ChampionReveal overlay sometimes blocks pointer events even with pointerEvents:none
      // due to the inner card. Use force:true to skip pointer-events check.
      await page.click(sel, { timeout: 1500, force: true });
      await page.waitForTimeout(600);
    } catch (err) {
      console.warn(`    preClick "${sel}" failed: ${(err as Error).message}`);
    }
  }
  await page.waitForTimeout(400);
  const path = resolve(dir, `${scenarioName}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function main() {
  console.log(`[ibg-visuals] server=${SERVER} web=${WEB} out=${OUT_BASE}`);
  const tournament = await pickTournament();
  console.log(`[ibg-visuals] tournament ${tournament.id} (${tournament.ideaCount} ideas, ${tournament.championIds.length} champ, phase=${tournament.phase})`);

  const events = await loadEvents(tournament.id);
  console.log(`[ibg-visuals] loaded ${events.length} events`);

  const browser: Browser = await chromium.launch();
  const summary: Record<string, Record<string, string>> = {};

  for (const vp of VIEWPORTS) {
    const dir = resolve(OUT_BASE, vp.name);
    mkdirSync(dir, { recursive: true });
    summary[vp.name] = {};

    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: 'dark',
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();

    for (const sc of SCENARIOS) {
      const idx = sc.pickIdx?.(events);
      const url = idx === undefined
        ? WEB
        : `${WEB}/?historical=${tournament.id}&until=${idx}`;
      try {
        const path = await captureScenario(page, dir, sc.name, url, sc.preClicks, sc.settleMs ?? 1500);
        console.log(`  ✓ ${vp.name}/${sc.name} → ${path}`);
        summary[vp.name][sc.name] = path;
      } catch (err) {
        console.error(`  ✗ ${vp.name}/${sc.name}: ${(err as Error).message}`);
      }
    }
    await ctx.close();
  }

  // Write a manifest with metadata for reference.
  const manifest = {
    tournamentId: tournament.id,
    eventCount: events.length,
    capturedAt: new Date().toISOString(),
    viewports: VIEWPORTS,
    scenarios: SCENARIOS.map((s) => ({ name: s.name, description: s.description })),
    files: summary,
  };
  writeFileSync(resolve(OUT_BASE, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[ibg-visuals] manifest at ${resolve(OUT_BASE, 'manifest.json')}`);

  await browser.close();
}

main().catch((err) => {
  console.error('[ibg-visuals] failed:', err);
  process.exit(1);
});

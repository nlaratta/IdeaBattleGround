# Idea Battleground

AI Idea Colosseum — agents generate competing product ideas, agents judge them, and the survivors battle in tournament rounds. Live, watchable, Twitch-able.

The eventual flow:
1. **Generate** thousands of ideas in parallel using a sampling matrix (domain × audience × business model × constraint × time horizon × vibe × persona) so diversity is structural, not just random words.
2. **Cull** near-duplicates via lightweight similarity, then run a parallel rubric pass (novelty / feasibility / market / weirdness / buildability) to slice to the top tier.
3. **Battle** survivors in Swiss-style pairwise rounds with Elo ratings.
4. **Final review** by a deep judge that writes critiques and produces champions.
5. **Visualize** the whole thing live: orbital "gravitational" view of orbs as ideas, with auto-zoom and a tree view for lineage.

## Status (v0.1)

What works today:
- Full tournament pipeline (server) with mock or live LLM provider.
- Live LLM provider runs through `@anthropic-ai/claude-agent-sdk` — no API key required, uses your local Claude Code subscription auth.
- Mock provider is the default so you can develop and test without burning calls.
- Live SSE stream of every event (`tournament:start`, `idea:generated`, `idea:scored`, `idea:killed`, `pairwise:result`, `champion`, `phase:change`, …).
- Web UI:
  - **Orbital view** — canvas with category-colored orbs sized by Elo; pair-flash beams between duelists; auto-follow camera with manual pan/zoom (wheel + drag).
  - **Tree view** — column-per-round bracket showing dupes / culled / survivors / champions.
  - **Leaderboard**, **ticker**, **inspector** (rubric scores + cell metadata), **controls** (counts, judges, rounds, finalists), collapsible side panels.

What's stubbed / not yet done:
- Embedding-based layout (currently uses category-centroid + jitter; replace with UMAP over real embeddings when budget allows).
- Mutation / crossover rounds (round-2 idea-rewrite + hybridization).
- Build-on-stream phase (Cloudflare Pages/Workers deploy from a Claude Code agent — separate milestone).
- SQLite persistence of historical tournaments (event bus is in-memory only).
- Director shot composer (smoothed cut/zoom planner for streaming).

## Quick start

```bash
npm install
npm run dev
```

This starts:
- API server on `http://localhost:8787` (mock mode by default).
- Web UI on `http://localhost:5173` with `/api` proxied to the server.

To run with a real LLM, copy `.env.example` to `.env` and set `MOCK_MODE=false`. No API key needed if Claude Code is already authenticated on this machine — the Agent SDK uses your subscription.

## Layout

```
.
├── server/              # Express + SSE + Agent SDK + tournament logic
│   ├── src/
│   │   ├── llm/         # provider interface + agent-sdk + mock impls
│   │   ├── generation/  # sampling matrix + generator prompts
│   │   ├── judging/     # rubric, swiss/elo pairwise, deep, dedup
│   │   ├── events/      # event bus + SSE handler
│   │   ├── api/         # express routes
│   │   ├── runner.ts    # orchestrates the full tournament
│   │   ├── layout.ts    # category-cluster orb positions + colors
│   │   └── index.ts
│   └── scripts/         # smoke tests
└── web/                 # Vite + React + canvas
    └── src/
        ├── views/       # OrbitalView, TreeView
        ├── components/  # Leaderboard, Ticker, Inspector, Controls
        ├── hooks/       # useTournament (SSE → reducer)
        └── App.tsx
```

## Knobs

Server `.env`:
- `MOCK_MODE` — `true` (default) for offline mock provider, `false` to call live Claude.
- `GENERATOR_MODEL`, `JUDGE_MODEL`, `DEEP_JUDGE_MODEL` — `sonnet`/`opus`/`haiku` aliases or full model IDs.
- `GENERATION_CONCURRENCY`, `JUDGING_CONCURRENCY` — parallel LLM calls.

UI controls:
- `ideas` — how many to generate this run.
- `judges/idea` — independent rubric scores per idea (averaged).
- `swiss rounds` — pairwise rounds.
- `finalists` — kept for the deep-judge phase.

## Why these design choices

- **Structural diversity > word seeds.** Random dictionary words alone produce cosmetic variety on top of identical archetypes. The matrix forces orthogonal-axis combinations (a hardware tinkerer × elderly users × subscription-only × must-work-offline cell behaves nothing like a contrarian-VC × Gen-Z × ad-supported × must-be-illegal-indoors cell).
- **Tiered judging.** All-pairs voting is O(n²); we run cheap parallel rubric on every idea, then Swiss-style pairwise on the top tier (~O(n log n)), then expensive deep judge on a handful. Critique-before-score reduces format/sycophancy bias.
- **Live event bus + SSE.** SSE replays buffered backlog to late-joining clients, so any browser refresh gets the full run.
- **Canvas orbital view.** Renders 100s–1000s of orbs cheaply. Category-cluster layout means similar ideas literally cluster in space, so the macro view is informative even when zoomed all the way out.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the deeper design notes.

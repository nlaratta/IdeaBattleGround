# Architecture

## Tournament pipeline

```
┌──────────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Sampling     │──▶│ Generate │──▶│ Dedupe   │──▶│ Rubric   │──▶│ Cull     │
│ matrix       │   │ (parallel│   │ (Jaccard │   │ (parallel│   │ (top 40% │
│ (orthogonal  │   │  LLM)    │   │  on text)│   │  LLM,    │   │  by mean)│
│  axes)       │   │          │   │          │   │  N judges)│   │          │
└──────────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
                                                                       │
                                                                       ▼
                  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
                  │ Champions│◀──│ Deep     │◀──│ Pairwise │◀──│ Swiss    │
                  │ (advance │   │ (Opus)   │   │ Elo cull │   │ rounds   │
                  │  verdict)│   │          │   │          │   │ (Sonnet) │
                  └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

Each box is also an event source on the bus. The web client reduces the event stream into a state tree.

## LLM provider abstraction

`server/src/llm/`:
- `index.ts` — `LlmProvider` interface (one method: `call({ systemPrompt, userPrompt, model, retries })`).
- `agent-sdk.ts` — wraps `@anthropic-ai/claude-agent-sdk`'s `query()`. No tools, JSON-only via prompt, retry on parse failure.
- `mock.ts` — deterministic; selects from a pool of pre-baked sample ideas, returns plausible numeric scores. Used in tests and during UI development.

Prompts live next to the consumer (`generation/prompts.ts`, `judging/rubric.ts`, etc.) and tag their system prompt with `IDEA_GENERATOR`, `RUBRIC_JUDGE`, `PAIRWISE_JUDGE`, or `DEEP_JUDGE` — the mock uses these tags to route to the right canned response.

## Sampling matrix

Defined in `server/src/generation/matrix.ts`. Six categorical axes plus a persona and a handful of seed words. The matrix samples each cell uniformly, but you can swap `buildMatrix` for a Latin-hypercube or "force coverage" sampler later.

Why the persona is separate: persona prompts have measurably bigger effect on generative diversity than swapping single dimensions, but they also tend to dominate everything else if you only use them. Keeping them as one axis among several anchors persona variety without letting it crowd out, e.g., constraint variety.

## Judging

### Rubric (tier 1)
- 5 axes, scored 1–10. `total = mean(axes)` on the server.
- Critique-before-score is enforced by prompt order. The schema requires `critique` first.
- Multiple judges per idea; averaging reduces single-judge variance.
- Use `sonnet` here — fast and cheap enough to run on every idea.

### Pairwise (tier 2)
- Swiss pairing: walk survivors in descending Elo and pair each with the closest-rated opponent it hasn't played yet (`pairSwiss` with a shared `played` set); rematches only if no fresh opponent remains. An odd field gives the lowest-rated idea a bye.
- Elo K-factor 32. `INITIAL_ELO = 1200`.
- Each round runs in parallel up to `JUDGING_CONCURRENCY`.
- After all rounds, top `finalists` advance.

### Deep (tier 3)
- Long-form critique with a strongest-point / fatal-flaw / verdict structure.
- Use `opus` here — runs on a handful of finalists; cost is bounded.

## Dedup

`server/src/judging/dedup.ts`. Tokenize `pitch + mechanism + targetUser`, drop stopwords, compute Jaccard between every new idea and the kept set. Threshold is 0.62.

For thousands of ideas this is still cheap (O(n²) on small token sets). When we scale to 10k+ ideas, replace with locality-sensitive hashing (MinHash) or real embedding-based clustering.

## Layout & color

`server/src/layout.ts`. Each category gets a stable polar angle from `fnv1a(category) % 360`. Each idea is jittered around that angle with radius `380 ± 80`. Category color is a hand-tuned palette mapping categories to hues.

This is intentionally not embedding-based — embeddings cost time and compute, and the category-cluster heuristic gives 80% of the visual benefit (similar ideas cluster spatially) for 0% of the latency.

When we add embeddings (likely Voyage AI to keep the Claude/Anthropic stack), swap `layoutIdea(idea)` to take the embedding and project via UMAP/t-SNE.

## Persistence

`server/src/db/store.ts` writes every tournament, idea, score, duel and event to SQLite (`DATA_DIR`, default `server/data/`). The History panel and `?historical=<id>` replay read from it.

## Event bus & SSE

In-memory pub/sub with a 5000-event ring buffer. New SSE clients get the buffered backlog replayed before live events stream in — so refreshing the browser mid-tournament resumes seamlessly.

Events are typed as a discriminated union (`Event` in `server/src/types.ts` mirrored in `web/src/types.ts`). The web reducer handles each event type idempotently.

## Web view layer

The reducer (`web/src/hooks/useTournament.ts`) computes:
- `ideas: Record<id, IdeaState>` — keyed for O(1) lookup.
- `pairFlashes: PairFlash[]` — last 50 duels, used for visual beams in canvas.
- `recentEloDeltas` — for the HUD delta display.
- `ticker` — 60-row capped feed.

The universe and orbital views are React Three Fiber (three.js) scenes with an auto-follow camera director that frames the alive ideas; the orbital view also supports manual camera control.

Tree view is HTML (no canvas) — easier to scroll, click, and copy text from.

## Open questions / future work

- **Mutation / crossover rounds.** Round 2 should optionally include "rewrite this idea with a twist" (mutation) and "combine these two survivors" (crossover) as separate generation calls feeding back into the same tournament.
- **Director.** A shot-composer that emits a `camera:plan` event so the orbital view can dramatize key moments — closeups on close duels, slow-zoom-out on dominant winners, cuts to the leaderboard.
- **Embedding-based layout.** Voyage AI embeddings → UMAP → 2D positions. Persist positions so reruns of the same tournament are visually consistent.
- **Cloudflare deploy phase.** Once a champion exists, kick off a Claude Code agent (full agentic) that scaffolds a project, deploys to a CF subdomain, and posts the URL back to the event stream.

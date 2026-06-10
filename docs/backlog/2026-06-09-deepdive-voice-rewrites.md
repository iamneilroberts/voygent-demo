# Backlog — finish deep-dive voice rewrites (-v2 companions) + flag onto /blog

**Filed:** 2026-06-09 · **Type:** feature / portfolio polish · **Priority:** nice-to-have (not product-blocking)
**Repo:** voygent-demo · **Prod:** demo.voygent.ai

> Filed here as a committed backlog item because the Voygent `report_issue` MCP
> tool was unreachable from the filing session (stale per-session catalog vs the
> live Worker — `-32602` on the whole issue family; `manage_issues` is only a
> *planned* consolidation, not shipped). Re-file into the Voygent issue system
> when the connector is refreshed if you want it tracked there too.

## Goal

Rewrite the remaining engineering deep-dive pages in Neil's voice and a blog
structure, as **additive `-v2` companion pages** in `worker/info/content.json`,
and flag each onto the new `/blog` landing. Originals stay untouched (Neil diffs).

## Done (shipped, origin/main ≥ d5013b0)

- **/blog landing is live** (https://demo.voygent.ai/blog): auto-indexes
  `content.json` entries flagged `blog:true`, client-side search + tag filter,
  editable hero (`blog-home`), Bio/Contact/GitHub footer.
- **context-economics-v2** done as the voice reference
  (https://demo.voygent.ai/info/context-economics-v2), flagged as the first blog
  post (`blog:true`, tags context/tools/cost). Includes Neil's "Too many tools"
  narrative + the markdown→PDF→HTML→template folio story.
- In-place editor + port-back tooling already exist (`scripts/info-content.mjs`;
  `mergeOverrides` preserves `blog`/`tags` on pull).

## Remaining — 9 companion pages

For each: add a new `<slug>-v2` entry to `worker/info/content.json`, rewrite the
original's technical content in Neil's voice + blog structure, set `blog:true`
plus a `tags` array. It auto-appears on `/blog`.

- [ ] bot-defeat-v2 · [ ] record-replay-v2 · [ ] cost-engineering-v2
- [ ] production-system-v2 · [ ] trip-integrity-v2 · [ ] data-stores-v2
- [ ] llm-options-v2 · [ ] phase-machine-v2 · [ ] subagents-v2

(`resume` is excluded — it is a CV, not an engineering topic.)

## Voice rules (the heart of it)

Strip: em-dashes, the "not X / it's Y" antithesis, marketing register
(seamless/powerful/robust/leverage/unlock/delve/elevate/game-changing/etc.),
exclamation points, rule-of-three cadence, overclaiming. Write: first person,
dry, concrete-problem-and-numbers first, honest about dead ends. Stub gaps with
`> TODO(neil):`. Honor the honesty ledger (label net-new/demo-only work as
planned, never shipped-in-prod; never claim live bot-defeat for Carnival-class
BMP). Structure per page: **challenge → approaches I dropped → the solution I run
→ future work.** Process is collaborative: Neil supplies a per-page narrative
(like he did for context-economics), it gets folded into the matching voice.

## Where to pick it up

- **Worktree:** `~/dev/voygent-demo-deepdive-voice` (branch `deepdive-voice-rewrite`),
  or a fresh one off latest `origin/main` (reel sessions are very active — rebase
  first, deploy as a superset).
- **The brief (ground truth + per-topic source facts):** voygent-lite branch
  `claude/fervent-edison-nzkyvq`,
  `docs/summaries/handoff-2026-06-09-demo-deepdive-voice-rewrite.md`
  (§2 voice rules, §4 source facts per topic, §4.13 honesty ledger).
- **The design spec (page → §4 mapping table):**
  `docs/superpowers/specs/2026-06-09-deepdive-voice-rewrite-design.md`.
- **Pattern to copy:** the `context-economics-v2` key in
  `worker/info/content.json`.
- **Blog spec:** `docs/superpowers/specs/2026-06-09-blog-landing-design.md`.

## Definition of done

All 9 companions written, flagged `blog:true` + tags, live on `/blog`, em-dash /
antithesis count = 0 in each body, tsc + vitest green, deployed as a superset.

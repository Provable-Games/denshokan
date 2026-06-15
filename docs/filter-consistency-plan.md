# Token Filter Consistency Plan

**Status:** Phase 1 in progress
**Owner:** infra
**Repos:** `denshokan` (API), `denshokan-sdk` (client), `death-mountain-client` (consumer)

## Background

`DenshokanClient.getTokens()` serves results from two datasources: the REST
**API** (Postgres, primary) and an **RPC fallback** (the on-chain `denshokan_viewer`)
used when the API is unreachable. The two paths support **different,
partially-overlapping** filter sets, and unsupported filters are **silently
dropped** rather than erroring.

This caused a production incident: with the API down, an "active games" query
(`gameOver: false`) hit the RPC fallback, which has no `not-game-over` filter, so
the filter was dropped and *every* game was returned as active.

## North star

> Every filter in `TokensFilterParams` returns the same logical result set
> regardless of datasource, and anything that can't be honored fails loudly
> instead of silently returning wrong data.

No DB migration is required — every column the missing filters need already
exists (`settings_id`, `objective_id`, `soulbound`, `minted_at`, `start_delay`,
`end_delay`, `completed_all_objectives`).

## Canonical filter semantics

- **`playable`** = `!game_over AND !completed_all_objectives AND now ≥ start AND (end == 0 OR now < end)`
  where `start = minted_at + start_delay` and
  `end = end_delay > 0 ? minted_at + start_delay + end_delay : 0` (0 = never expires).
  This is exactly `token_state::is_token_playable` in game-components — the
  on-chain source of truth. Any SQL replica MUST stay in sync with it.
- **`gameOver`** = completeness only (`true`/`false`); never conflated with playability.

## Support matrix (target)

Each filter declares a support level per datasource: **native** (pushed down),
**post-filter** (applied in JS; pagination/`total` approximate), or
**unsupported** (throws `UnsupportedFilterError`).

| Filter | API | RPC fallback |
|---|---|---|
| `gameId` | native | native |
| `gameAddress` | native (normalize → gameId) | native |
| `owner` | native | native |
| `minterAddress` | native | native |
| `gameOver` | native (true/false) | true native; **false → post-filter** (decision #1) |
| `playable` | native | native (true only) |
| `settingsId` | native | native (needs game) |
| `objectiveId` | native | native (needs game) |
| `soulbound` | native | native |
| `hasContext` | native | post-filter (decoded id) |
| `contextId` | native | post-filter |
| `contextName` | native | unsupported |
| `mintedAfter/Before` | native | native |
| `sort` | native | unsupported / best-effort |

## Phases

### Phase 1 — additive API parity (no behavior break) — IN PROGRESS
- [x] API route: add `playable`, `settingsId`, `objectiveId`, `soulbound`, `mintedAfter/Before`
- [x] SDK API client: forward the above to the API
- [ ] `gameAddress → gameId` normalization on the API path (SDK-side resolver)
- [ ] API smoke-test coverage for each new filter (extends PR #91)

### Phase 2 — RPC fallback gaps
- [ ] `gameOver: false` (per decision #1)
- [ ] `hasContext` post-filter on decoded token id
- [ ] formalize `contextId` post-filter + document caveat
- [ ] mark `contextName` / `sort` unsupported

### Phase 3 — unsupported-filter policy (minor breaking change)
- [ ] shared filter-support map consumed by both code paths
- [ ] `UnsupportedFilterError` for `unsupported`; one-time `console.warn` for `post-filter`
- [ ] remove all silent drops; document in SDK changelog

### Phase 4 — guardrails
- [ ] parity test: same query against both datasources → identical token-ID set
- [ ] `is_playable` boundary test (not-started / in-window / expired / `end_delay=0` / game_over / completed)
- [ ] wire into CI

### Phase 5 — consumer migration
- [ ] `death-mountain-client` MyGames: `gameOver: false` → `playable: true`

## Open decisions

1. **`gameOver: false` on RPC** — post-filter (parity, imperfect pagination) vs
   declare unsupported and steer callers to `playable`. _Leaning: post-filter._
2. **Unsupported-filter behavior** — hard throw vs warn + best-effort.
   _Leaning: throw for `unsupported`, warn for `post-filter`._
3. **`playable` perf** — time-window predicate is a range scan; if it gets hot,
   add a generated `end_time` column + index. _Defer unless needed._

## Notes

- The `is_playable` SQL replica is a drift risk; the route comment links to the
  contract function and Phase 4 adds a boundary test to catch divergence.
- Phase 1 is additive and shippable independently; it pairs with the `playable`
  work and should land after PRs #90/#91.

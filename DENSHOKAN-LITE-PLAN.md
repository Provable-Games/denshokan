# Denshokan Lite — a per-game, gas-minimal game token

**Status:** architecture plan for human review. No code changes proposed here; nothing was
modified in either repository.

**Author's summary in one paragraph.** Denshokan was built as one shared collection so a single
indexer, SDK and API could serve every game. On mainnet today that collection is **99.74 % one
game**. The multi-game machinery it pays for — a 30-bit `game_id` in every token id, a registry
lookup on every callback, `token_uri` routing, dynamic royalties through a creator-token
ownership query — costs real gas on a hot path that is now the binding constraint on whether
onchain games are viable at all. Denshokan Lite replaces the shared collection with a **factory
that deploys one token contract per game**, deletes `update_game` in favour of a single
**push-based `settle` at game end**, and moves the playability check into **pure arithmetic on the
token id the game already holds**. The honest gas verdict is stated up front in
[§5](#5-gas-model): measured against the `gas-cleanup` baseline the marginal saving is
**~16.9 M L2 gas per game, ≈ $0.0155, ≈ 5.2 %**. That is small. The architectural case does not
rest on it — it rests on removing a shared, upgradeable, cross-contract dependency from the hot
path before client-side proving makes the current design structurally wrong.

---

## 0. Why now — the framing this plan is built on

Two things changed since Denshokan was designed.

**1. Gas on Starknet is up ~4× since launch.** That has priced out most onchain games. Death
Mountain is the only successful one, and it pays a large overhead to use Denshokan versus a
dedicated token contract. Overhead that was rounding error at launch prices is now a line item in
an operator's P&L — every Death Mountain game transaction is fee-sponsored by the operator via the
Cartridge paymaster, so this is a direct cost, not a player cost.

**2. Client-side proving is coming.** When the game runs on the player's device, **the network may
not even have live score data**. Infrastructure built around per-transaction score pushes stops
making sense: there is nothing to push until settlement.

**The principle every decision below follows: shift this infrastructure from tx-centric to
game-centric.** Stop checking game state every action. Stop pushing score updates every action.
Concretely, that means three rules, and each design decision in this document cites the one it
follows:

- **R1 — Nothing crosses a contract boundary per action that could be derived from the token id.**
- **R2 — The token contract is written exactly once per game, at settlement, with values pushed
  in by the game, never pulled back out of it.**
- **R3 — Liveness is an off-chain concern.** The chain records outcomes; indexers and clients
  reconstruct in-progress state from the game's own event stream, which already exists.

### One correction to the framing, with evidence

The brief says removing `game_id` frees **64 bits**. It frees **30**. The field is 30 bits wide in
both the revision Death Mountain compiles against and the `next` branch this repo tracks:

- `packages/embeddable_game_standard/src/token/structs.cairo:38` (rev `e24bf41`, the rev pinned in
  Death Mountain's `Scarb.lock:86`) — `| 0-29 | game_id | 30 bits |`
- `/workspace/game-components/packages/token/src/structs.cairo` (branch `next`) — same 30 bits.

And the deployed layout matches: the mainnet cost model decodes `minted_by` as
`(token_id >> 30) & 0xFFFFFFFFFF`, which is only correct if `game_id` occupies bits 0–29. I
verified this independently against live mainnet mints — see [§1.1](#11-the-token-id-today).

This matters for the layout section but not for the argument. 30 bits to distinguish **three**
values (see below) is the same absurdity as 64.

### The numbers that decide it

All measured on Starknet mainnet during this analysis, read-only RPC, no transactions sent.

| fact | value | how |
|---|---|---|
| Games registered in the whole Denshokan registry | **3** | `MinigameRegistry.game_count()` = `0x3` |
| Which | Super Death Mountain (`game_id 1`), zKube (`2`), zordle (`3`) | `registry.game_metadata(1..3)` |
| Tokens in the collection | **67,217** | Denshokan API `/tokens?limit=1` → `total` |
| … that are Death Mountain | **67,041 (99.74 %)** | `/tokens?game_id=1` |
| … zKube / zordle | 173 / 3 (0.26 %) | `/tokens?game_id={2,3}` |
| Death Mountain's `royalty_fraction` | **0** | `/games/1` → `royaltyFraction: "0"` |
| Minters registered (global `minted_by` namespace) | **45** | `/minters` → `total` |

A 30-bit field (capacity 1,073,741,823) is carrying the constant `1` for 99.74 % of the tokens
that exist, and the entire dynamic-royalty apparatus — a registry struct read plus an ERC-721
`owner_of` on the creator token — computes to **zero** for the only consumer that matters.

---

## 1. Current-state analysis

### 1.1 The token id today

`packages/embeddable_game_standard/src/token/structs.cairo:33-55` (rev `e24bf41`). 251 bits,
u128-aligned so no field straddles the boundary.

**Low u128 (128 bits)**

| bits | field | width | notes |
|---|---|---|---|
| 0–29 | `game_id` | 30 | **constant `1` for every Death Mountain token** |
| 30–69 | `minted_by` | 40 | index into Denshokan's global minter table (45 entries live) |
| 70–99 | `settings_id` | 30 | |
| 100–124 | `start_delay` | 25 | seconds after `minted_at`; **always 0** at every DM mint site |
| 125 | `soulbound` | 1 | |
| 126 | `has_context` | 1 | |
| 127 | `paymaster` | 1 | `false` everywhere in DM |

**High u128 (123 bits)**

| bits | field | width | notes |
|---|---|---|---|
| 0–34 | `minted_at` | 35 | unix seconds |
| 35–59 | `end_delay` | 25 | 0 ⇒ never expires |
| 60–89 | `objective_id` | 30 | `None` at every DM mint site |
| 90–99 | `tx_hash` | 10 | low bits of the tx hash, collision protection |
| 100–109 | `salt` | 10 | client-supplied, multicall collision protection |
| 110–122 | `metadata` | 13 | free-form; `multi_community.cairo:973` stamps a bracket here |

Verified live. Decoding a real mainnet mint
(`0x690daa55c3a8ca80993a56c9038f5bcdc69d2efccf766422bd0ed80a73add7c`) with these offsets yields
`game_id=1, minted_by=9 (Greed Run), settings_id=1` — and `minted_by` 9 / 19 / 38 across the sample
match the known minter ids (9 = Greed Run, 19 = Beast Mode, 38 = Budokan Tournaments).

`TokenMetadata` is reconstructed from the id with **no storage read** except the mutable state
(`structs.cairo:389-412`):

```cairo
lifecycle: Lifecycle {
    start: packed.minted_at + packed.start_delay.into(),
    end:   if packed.end_delay > 0 {
               packed.minted_at + packed.start_delay.into() + packed.end_delay.into()
           } else { 0 },
},
```

Only three things are *not* in the id: `game_over`, `completed_objective`, `completed_at` — packed
together into one `felt252` in `token_mutable_state` (`structs.cairo:93-116`).

### 1.2 What `update_game` does, step by step, and why it costs what it costs

`packages/embeddable_game_standard/src/token/token_component.cairo:692-808`. Reached from the game
via `minigame/minigame.cairo:27-32` `post_action`.

I traced 10 mainnet action transactions covering 16 game actions (blocks 12,321,0xx). The
decomposition below is **measured, not modelled**, and had near-zero variance — 13 of 16 calls were
exactly 4,110,720.

| step | code | L2 gas | why |
|---|---|---:|---|
| `erc721.exists(token_id)` | :696-700 | — | storage read, folded into self |
| `unpack_game_id` → `resolve_game_address(game_id)` | :702-703, :1154-1169 | **600,000** | registry `game_address_from_id(1)` |
| SRC5 probe `supports_interface(IMINIGAME_ID)` on the game | :706-710 | **40,000** | syscall floor |
| read `token_mutable_state` | :713 | — | storage read |
| objective check (skipped, `objective_id == 0` on all DM tokens) | :716-722 | 0 | |
| `game_over(token_id)` → GameToken → GameCore `load_assets` | :729 | **1,800,000** | 240,000 self + **1,560,000** to re-read the adventurer |
| `score(token_id)` → GameToken → GameCore `load_assets` | :730 | **1,800,000** | identical second read of the same adventurer |
| monotonic latches + conditional write | :733-759 | — | |
| **unconditional** `emit_metadata_update` (ERC-4906) | :762 | — | |
| minter lookup + SRC5 probe + `on_game_action` | :767-807 | 0 | the probe on the minter contract reports 0 gas, consistent with a reverted-and-caught call; `on_game_action` does not fire |
| **total per action** | | **4,110,720** | |

Two observations drive the whole redesign.

**(a) The 600,000-gas registry lookup translates a compile-time constant into a compile-time
constant.** I confirmed the calldata and result directly: `registry.game_address_from_id(0x1)` →
`0x4de0351ceab4…`. It costs 600,000 because `registry_component.cairo:215-219` is

```cairo
fn game_address_from_id(self: @..., game_id: u64) -> ContractAddress {
    self.game_metadata.entry(game_id).read().contract_address
}
```

— a **whole-`GameMetadata`-struct read** (nine `ByteArray`s: name, description, developer,
publisher, genre, image, color, client_url, plus three addresses and three scalars) to return one
field. This is the same class of defect the `gas-cleanup` audit found in `get_settings`, and the
same fix applies (`self.game_metadata.entry(id).contract_address.read()`) — but Denshokan is a
contract Death Mountain does not own or upgrade, so from the game's side it is unfixable. Under
Lite the lookup ceases to exist.

**(b) 3,600,000 of the 4,110,720 is the token pulling data the game already had in registers.**
`game_over()` and `score()` are two separate cross-contract round trips into GameToken, each of
which makes a *third* hop into GameCore's `load_assets` to deserialise the same adventurer. GameCore
called `update_game` from inside an entrypoint where the adventurer was **already in memory**. This
inverted data flow is the single most expensive thing in the standard, and R2 fixes it by passing
the values in as arguments.

### 1.3 The per-action Denshokan tax, and what `gas-cleanup` did and did not remove

Death Mountain's `game_core.cairo` wraps **every** mutating entrypoint in the same three calls
(lines 215-216, 317-318, 346-347, 371-372, 398-399, 417-418, 436-437, 453-454, 471-472, 494-495):

```cairo
assert_token_ownership(minigame_token_address, adventurer_id);   // ERC721.owner_of == caller
pre_action(minigame_token_address, adventurer_id);               // denshokan.assert_is_playable
... game logic ...
post_action(minigame_token_address, adventurer_id);              // denshokan.update_game
```

Measured per action (16 observations, zero variance on the first two):

| call | L2 gas/action | fate under `gas-cleanup` |
|---|---:|---|
| `owner_of` | **40,000** | **survives** — untouched |
| `assert_is_playable` | **160,000** | **survives** — untouched |
| `update_game` | **4,110,720** | reduced to ~2 calls per game |

`gas-cleanup` (commit `8d3485e`) replaced 9 of the 10 `post_action` sites with `maybe_post_action`,
which fires only on death/surrender or for objective-bearing tokens, and swapped `get_settings` for
a field-level `get_action_settings`. It did **not** touch `pre_action` or `assert_token_ownership`.
So after `gas-cleanup`, Denshokan still costs **200,000 L2 gas on every single action**, plus
~2 × 4,110,720 per game at start and at settlement.

Aggregated over my 10-transaction sample (mean 16.32 M L2 gas/tx, 1.6 actions/tx): `update_game`
6,613,152/tx, `assert_is_playable` 256,000/tx, `owner_of` 64,000/tx — **6,933,152/tx = 42.5 % of
the transaction**. This independently reproduces the cost model's 36.9 % for `update_game`
(6,729,564) and its 1.9 % "misc (`owner_of`, playable checks)" line (340,337 vs my 320,000).

### 1.4 The mint path — measured, and a defect nobody has fixed

Traced `0x690daa55…` (Greed Run `buy_game`, total tx 7,297,840 L2 gas). The Denshokan `mint`
subtree:

| step | L2 gas | note |
|---|---:|---|
| `mint` self (ERC-721 mint, Enumerable writes, minter registration, `pack_token_id`) | 1,091,200 | |
| game `supports_interface(IMINIGAME_ID)` | 40,000 | multi-game validation |
| registry `game_id_from_address(game)` | 40,000 | multi-game routing |
| game `settings_address()` | 40,000 | |
| game `supports_interface(ISETTINGS)` | 40,000 | |
| **game `settings_exist(settings_id)`** | **1,520,000** | see below |
| **total** | **2,771,200** | |

`settings_exist` is Death Mountain's own code, `contracts/src/systems/game_token.cairo:321-324`:

```cairo
fn settings_exist(self: @ContractState, settings_id: u32) -> bool {
    let settings = self.game_settings.read(settings_id);   // whole 69-slot struct
    settings.adventurer.health > 0                          // one field
}
```

**This is the same 69-slot whole-struct read the `gas-cleanup` branch removed from the action hot
path, still present on the mint path.** It is worth 1.52 M gas per mint and the fix is one line —
`self.game_settings.entry(settings_id).adventurer.health.read()` — with no storage change and no
migration, exactly as `gas-cleanup` §4.3 established. **This saving is available today and does not
need Denshokan Lite.** I flag it here because it must not be double-counted into Lite's ledger, and
because it should ship regardless of whether this plan is accepted.

A second mint variant (Budokan, `0x38ad548b…`) measured 2,971,200 — same subtree, +200,000 self.

### 1.5 Every place `game_id` is used for internal routing

| site | file | what it does |
|---|---|---|
| `resolve_game_address` | `token_component.cairo:1154-1169` | `game_id → registry → address`; called by `update_game`. **600,000 gas/action.** |
| `renderer_address` | `token_component.cairo:187-213` | `game_id == 0` ⇒ single-game; else registry `game_metadata(game_id).renderer_address` |
| `client_url` | `token_component.cairo:121-133` | falls back to `registry.game_metadata(game_id).client_url` |
| `validate_and_process_game_address` | `token_component.cairo:1084-1110` | mint-time: `registry.game_id_from_address(addr)`, asserts `!= 0` |
| `token_uri` | `contracts/packages/token/src/denshokan.cairo:298-447` | asserts `game_id != 0`, then registry lookup, then **up to 8 raw `call_contract_syscall`s** (`settings_address`, `score`, `token_name`, `token_description`, `settings_details`, `context_details`, `objectives_details`, `game_details_svg`, `game_details`) |
| `royalty_info` | `denshokan.cairo:462-490` | `registry.game_metadata(game_id).royalty_fraction` **plus** `registry_erc721.owner_of(game_id)` — two cross-contract calls to compute a receiver, and the fraction is **0** for Death Mountain |
| `get_scores` | `denshokan.cairo:505-535` | per-token registry lookup, cached within a batch |

**Death Mountain never unpacks `game_id` on chain.** `unpack_game_id` appears nowhere in
`contracts/src/`. It is used only by the client (`GAME_ID = 1`) and the indexer's decoder comment.
The 30 bits exist entirely to let *Denshokan* route back to the game — a routing problem a per-game
contract does not have.

### 1.6 What the off-chain stack actually consumes — this determines what may change freely

This is the most consequential part of the current-state analysis, because it turns out the
expensive on-chain push is **not** what feeds the indexer.

**Denshokan's own indexer subscribes to exactly two addresses** (`indexer/apibara.config.ts:7,9`):
the token contract and the registry. It decodes **ten** selectors (`indexer/src/lib/decoder.ts:65-76`):
`Transfer`, `MinterRegistryUpdate`, `ObjectiveCreated`, `SettingsCreated`, `GameRegistryUpdate`,
`GameMetadataUpdate`, `GameRoyaltyUpdate`, `GameFeeUpdate`, `DefaultGameFeeUpdate`, `MetadataUpdate`.

**`ScoreUpdate` and `GameOver` events no longer exist.** They were deleted in commit `d763a44`
("game-components replaced per-field token events … with the ERC-4906 `MetadataUpdate` event").
So the live-score path today is:

1. `update_game` unconditionally emits ERC-4906 `MetadataUpdate{token_id}` — **the only signal**.
2. The indexer writes *only dirty flags*: `token_uri_fetched=false`, `metadata_update_block=N`
   (`indexers/denshokan.indexer.ts:449-459`). **No score is written here.**
3. Up to **30 seconds** later (`URI_FETCHER_INTERVAL_MS`, default 30,000), a separate process
   `indexer/scripts/fetch-token-uris.ts:91` calls `token_uri(tokenId)` over RPC.
4. It base64-decodes the result and greps `attributes[]` for `trait_type == "Score"`
   (`decoder.ts:717-719`), then `UPDATE tokens SET current_score = …`.
5. A Postgres row trigger `score_update_notify` fires `pg_notify`, the API relays it over
   WebSocket, and the client renders it.

I called `token_uri` on a live Death Mountain token: **562 felts returned**. Commit `b883074`
records the practical size: *"A by-ids poll of ~1,200 tokens is ~37 MB — almost entirely tokenUri —
which drove a ~90× egress spike."* So **~40 KB per token per score tick**.

Three conclusions follow, and they are the foundation of [§4](#4-score-architecture):

- **The "ScoreUpdate" event the SDK and client consume is a Postgres row trigger, not a Starknet
  event.** There is no on-chain score event anywhere in the pipeline.
- **The system is already a pull architecture.** 4.1 M L2 gas per action is being spent to ring a
  bell that causes a ~40 KB polled read up to 30 seconds later. The gas buys latency, not data.
- `score_history` is **write-dead** — nothing in the indexer or fetcher ever inserts into it (the
  only writer is the test seeder `api/scripts/seed.ts:242`), yet `GET /tokens/:id/scores` still
  serves it, so that endpoint returns `[]` for every real token.

**Death Mountain's own stack does not touch Denshokan at all for game state.** Its indexer
subscribes to GameCore's `GameEvent` and the dungeon contracts; the Denshokan address appears
nowhere in `indexer/apibara.config.ts`. Death, score and level are all derived from `GameEvent`.
The single touch point is a best-effort REST call to Denshokan's API for player name and owner
(`indexer/indexers/game.indexer.ts:988-1008`, `api/src/lib/liveTracker.ts:7-18`), wrapped in
`catch → continue`.

**What is inherently multi-game in the API** (i.e. genuinely lost by going per-game):
`GET /games` discovery and its genre/developer facets; `GET /players/:address/stats`
(`countDistinct(tokens.gameId) as gamesPlayed`); unscoped `GET /players/:address/tokens`;
`GET /minters`; unscoped `POST /tokens/rank`; the WS `new_games`/`new_minters` channels.

**What is already per-game underneath:** everything else. The hot leaderboard indexes are already
`(game_id, …)`-leading (`schema.ts:122-124`); `objectives` and `settings` are uniquely keyed on
`(game_address, id)`; every WS channel accepts a `gameIds` filter. The per-game decomposition is
mostly a presentation change, not a data-model change.

**Client (Death Mountain).** `death-mountain-client` reads via `@provable-games/denshokan-sdk`,
pins `GAME_ID = 1`, and mirrors the bit layout in `src/utils/tokenId.ts`. It already derives expiry
client-side as `mintedAt + endDelay` (`src/hooks/usePlayableTokens.ts:8-11`) — the same
`start_delay`-omitting shortcut the dungeons use on chain.

**Three independent copies of the bit layout exist**: `indexer/src/lib/decoder.ts:135-242`,
`client/src/utils/packed-token-id.ts:43-92` (dead code — nothing imports it), and
`denshokan-sdk/src/utils/token-id.ts`. This is a strong argument for the layout choice in
[§2.3](#23-the-v2-token-id-layout).

---

## 2. Proposed architecture

### 2.1 Shape

```
                    ┌──────────────────────────┐
                    │   DenshokanLiteFactory   │   deploy-time only; never on a hot path
                    │  deploy_token(...)       │   emits GameTokenDeployed
                    │  token_of / game_of      │   Map + append-only index
                    │  compute_address(...)    │   pure; mirrors the address formula
                    └───────────┬──────────────┘
                                │ deploy_syscall(class_hash, salt=hash(game_addr), …)
                                ▼
        ┌────────────────────────────────────────────────────────┐
        │  DenshokanLiteToken  (one per game, ERC-721+2981+5)    │
        │  • game_address: immutable (constructor)               │
        │  • no game_id, no registry, no routing                 │
        │  • begin_action(token_id, caller) -> ActionSettings    │  ← the only per-action call
        │  • settle(token_id, score, game_over)                  │  ← the only write during a game
        │  • token_uri: read-through to the game, no registry    │
        └───────────────────────┬────────────────────────────────┘
                                │ owns / is owned by
                                ▼
                       the game's own contracts
```

**Recommendation, and it is the load-bearing one: for Death Mountain the Lite token contract
should *be* the existing `GameToken` contract**, not a fourth contract beside it.

Death Mountain today is Denshokan → `GameToken` (`0x4de03…`) → `GameCore` (`0x23f86…`).
`GameToken` already holds the settings map, the objectives, the `IMinigameTokenData` `score`/
`game_over` implementations, and a dispatcher into `GameCore`. It is *already* the per-game shim
that Denshokan routes to. Adding ERC-721 storage to it and deleting Denshokan from the path
collapses three contracts to two and — critically — lets the per-action ownership check, the
lifecycle check and the settings read be **one syscall instead of three**. That single fusion is
the majority of Lite's measurable saving ([§5](#5-gas-model)).

The factory still matters even in that arrangement: it is what makes the pattern reusable by the
next game and what provides discovery without a shared collection.

### 2.2 What is encoded in / derived from the deterministic address, and how discovery works

Starknet contract addresses are a pure function of
`(deployer_address, salt, class_hash, hash(constructor_calldata))`. A factory that deploys with
`deploy_syscall(class_hash, salt, calldata, deploy_from_zero: false)` therefore produces an address
that **anyone can compute offline**, given the factory address, the class hash and the salt.

Fix `salt = poseidon(game_address)`. Then:

- **Forward discovery (game → token), off chain, zero RPC:** compute the address. The client, the
  indexer, a marketplace and a tournament contract can all do this without reading state.
- **Forward discovery, on chain:** `factory.token_of(game_address)` — one storage read. Deploy-time
  and tooling only; **never on a hot path** (R1).
- **Reverse (token → game):** the token contract stores `game_address` as an immutable constructor
  argument and exposes `game_address()`. One read, and in the recommended merged arrangement it is
  `get_contract_address()` — free.
- **Authenticity:** "is this a genuine Denshokan Lite collection?" is answered by recomputing the
  address from `(factory, class_hash, poseidon(game_address))` and comparing. Pure arithmetic, no
  gas, no trusted registry.
- **Enumeration:** the factory emits one event type, `GameTokenDeployed { game_address,
  token_address, class_hash, salt, deployer }`, and keeps an append-only `token_at(index)` index.
  A single indexer subscribes to the factory and then to each token address it announces.

**This is strictly more information than the registry provides today**, at zero per-action cost.
The registry's `game_id → address` map is replaced by an address that *is* the identity. The
registry's `GameMetadata` blob (name, description, developer, publisher, genre, image, color,
client_url, renderer, royalty, skills, version) moves onto the token contract itself as
constructor-set immutables plus owner-settable fields — where `token_uri` needs it anyway, without
a cross-contract call.

What is genuinely lost: a *permissionless* global list. Today anyone can `register_game` and appear
in `GET /games`. Under a factory, the factory owner controls which class hashes may be deployed —
or does not, if `deploy_token` is left permissionless. **Recommendation: leave `deploy_token`
permissionless but let it record the deployer**, preserving the open-registration property, and let
the *indexer* apply an allow-list for what it surfaces. Curation is a presentation problem; it does
not belong on chain.

### 2.3 The v2 token-id layout

**Recommendation: keep every surviving field at its current bit offset. Do not compact.**

The reasoning is not aesthetic. There are five independent implementations of this layout in
production — Cairo `unpack_*` helpers, Death Mountain's dungeon claim arithmetic, the Denshokan
indexer decoder, the Death Mountain client, and the SDK — and the source already carries the scar
of a previous compaction: *"BREAKING CHANGE: Field order differs from previous layout. All existing
packed token IDs will decode incorrectly with this new layout"* (`structs.cairo:59-60`). Holding
offsets fixed means every one of those five decoders keeps working unmodified, and legacy and Lite
ids decode with the *same code*.

So `game_id`'s 30 bits become:

- **bits 26–29 → `format` (4 bits).** `0` = legacy Denshokan layout; `1` = Denshokan Lite v1.
- **bits 0–25 → `extra` (26 bits).** Free-form, game-defined, default 0.

**Why `format` goes at bits 26–29 and not 0–3.** Every token ever minted has `game_id ∈ {1,2,3}`, so
bits 26–29 are **zero on all 67,217 existing tokens** and cannot become non-zero until game id
67,108,864. Putting the discriminator there makes legacy-vs-Lite detection a 4-bit test that is
unambiguous against the entire deployed history, and makes dual-read in [§6](#6-migration) a
free arithmetic check rather than a storage lookup. Putting it at bits 0–3 would collide: a legacy
Death Mountain token has `game_id = 1`, i.e. bits 0–3 = `0b0001`.

A second benefit: a Lite id read by *legacy* code yields `unpack_game_id = 67,108,864 + extra`,
which resolves to address `0` in the registry — **fail-closed**, a loud failure rather than silent
mis-routing.

**Before / after, complete.**

| bits | v1 (today) | width | v2 (Lite) | width |
|---|---|---:|---|---:|
| **Low u128** | | | | |
| 0–25 | `game_id` (part) | 26 | **`extra`** (game-defined, default 0) | 26 |
| 26–29 | `game_id` (part) | 4 | **`format`** (`1` = Lite v1) | 4 |
| 30–69 | `minted_by` | 40 | `minted_by` — *unchanged* | 40 |
| 70–99 | `settings_id` | 30 | `settings_id` — *unchanged* | 30 |
| 100–124 | `start_delay` | 25 | `start_delay` — *unchanged* | 25 |
| 125 | `soulbound` | 1 | `soulbound` — *unchanged* | 1 |
| 126 | `has_context` | 1 | `has_context` — *unchanged* | 1 |
| 127 | `paymaster` | 1 | `paymaster` — *unchanged* | 1 |
| **High u128** | | | | |
| 0–34 | `minted_at` | 35 | `minted_at` — *unchanged* | 35 |
| 35–59 | `end_delay` | 25 | `end_delay` — *unchanged* | 25 |
| 60–89 | `objective_id` | 30 | `objective_id` — *unchanged* | 30 |
| 90–99 | `tx_hash` | 10 | `tx_hash` — *unchanged* | 10 |
| 100–109 | `salt` | 10 | `salt` — *unchanged* | 10 |
| 110–122 | `metadata` | 13 | `metadata` — *unchanged* | 13 |

Total 251 bits, unchanged. Low half still sums to exactly 128 (26+4+40+30+25+1+1+1); high half to
123.

`minted_by` **must stay 40 bits and must stay meaningful** — see the migration hazard in
[§6.4](#64-the-minted_by-hazard-read-this-one).

**The alternative considered and rejected:** shift all fields down 30 bits and put `reserved` at
the top. It buys a tidier layout and 30 contiguous spare bits, and costs a simultaneous, coordinated
update to five decoders in three repositories plus every dungeon's claim arithmetic, for zero gas.
Not worth it. If 26 bits of `extra` ever proves insufficient, that is the moment to pay the cost —
and by then `format` will make the migration safe.

### 2.4 Interfaces

```cairo
#[starknet::interface]
pub trait IDenshokanLiteFactory<T> {
    /// Deploys a token contract for `game_address`. salt = poseidon(game_address).
    fn deploy_token(
        ref self: T,
        class_hash: ClassHash,
        game_address: ContractAddress,
        name: ByteArray,
        symbol: ByteArray,
        royalty_receiver: ContractAddress,
        royalty_bps: u16,
    ) -> ContractAddress;

    fn token_of(self: @T, game_address: ContractAddress) -> ContractAddress;
    fn game_of(self: @T, token_address: ContractAddress) -> ContractAddress;
    fn token_count(self: @T) -> u32;
    fn token_at(self: @T, index: u32) -> ContractAddress;
    /// Pure — mirrors the Starknet address formula. No storage read.
    fn compute_address(self: @T, class_hash: ClassHash, game_address: ContractAddress)
        -> ContractAddress;
}

#[starknet::interface]
pub trait IDenshokanLiteToken<T> {
    // ---- mint: no game_address argument; this contract serves exactly one game ----
    fn mint(
        ref self: T,
        to: ContractAddress,
        player_name: Option<felt252>,
        settings_id: Option<u32>,
        start: Option<u64>,          // absolute timestamps in, delays stored in the id
        end: Option<u64>,
        objective_id: Option<u32>,
        context: Option<GameContextDetails>,
        soulbound: bool,
        paymaster: bool,
        salt: u16,
        metadata: u16,
        extra: u32,                  // 26 bits
    ) -> felt252;

    // ---- the ONE per-action call (R1). Replaces owner_of + assert_is_playable +
    //      get_action_settings. Asserts caller owns the token and the window is open,
    //      then returns the settings the action needs. One syscall, not three.
    fn begin_action(self: @T, token_id: felt252, caller: ContractAddress) -> ActionSettings;

    // ---- the ONE write during a game (R2). Values pushed in; nothing pulled back out.
    //      Callable only by game_address. Monotonic: game_over false->true only.
    fn settle(ref self: T, token_id: felt252, score: u64, game_over: bool,
              completed_objective: bool);

    // ---- views ----
    fn game_address(self: @T) -> ContractAddress;
    fn token_metadata(self: @T, token_id: felt252) -> LiteTokenMetadata;  // no game_id field
    fn is_playable(self: @T, token_id: felt252) -> bool;
    fn score(self: @T, token_id: felt252) -> u64;   // settled value, else read-through to the game
    fn settled(self: @T, token_id: felt252) -> bool;
    // ERC-721, ERC-721Metadata, ERC-2981, SRC-5 as usual.
}
```

Notes on the shape:

- **`begin_action` takes `caller` explicitly** rather than reading `get_caller_address()`, because
  the caller from the token's perspective is GameCore, not the player. GameCore must therefore be
  the only address allowed to pass an arbitrary `caller` — enforce with a single immutable
  `game_core` address check, or accept `get_caller_address()` when the caller is the player
  directly. This is a real authorisation surface and must be reviewed carefully; it is the one
  place Lite is *less* obviously safe than the status quo, where `owner_of` was checked by the
  game against `get_caller_address()` in its own frame.
- **`settle` takes `score` and `game_over` as arguments.** This is R2 and it is the whole point. It
  inverts 3,600,000 gas of `game_over()`/`score()`/`load_assets` round-tripping into two felts of
  calldata.
- **No `update_game`.** Nothing external needs to poke the token to refresh it, because nothing
  during play is stale in a way that matters — the score view reads through to the game.
- **No `game_registry_address`, no `resolve_game_address`, no `renderer_address` routing.** The
  renderer is a constructor-set, owner-updatable address on the token.

### 2.5 `token_uri` and royalties without routing

`token_uri` today makes a registry read plus up to eight raw syscalls, and returns ~40 KB. Under
Lite:

- The registry read disappears; `GameMetadata` lives on this contract.
- `score` is read-through to `game_address` **only when the token is not yet settled**; after
  settlement it is a local storage read.
- The remaining renderer syscalls stay — they are what makes the SVG, and they are view-only and
  free.

Royalties become a flat `(receiver, bps)` pair on the contract, owner-settable. This removes two
cross-contract calls (`registry.game_metadata` and `registry_erc721.owner_of(game_id)`) from
`royalty_info`. **For Death Mountain this is a behaviour-preserving change to a value that is
currently zero.** For a game that *does* want creator-token-follows-ownership royalties, the token
can keep an optional `royalty_receiver_resolver` address; that is a per-game opt-in, not a tax on
everyone.

---

## 3. Lifecycle without per-action calls

**The brief's claim is correct, with one qualification that changes the design.**

Verified: `minted_at`, `start_delay` and `end_delay` are all in the token id, and `TokenMetadata`
derives the window from them by pure arithmetic with no storage access
(`structs.cairo:389-412`, quoted in §1.1). So a game holding the token id can compute

```
start = minted_at + start_delay
end   = if end_delay > 0 { minted_at + start_delay + end_delay } else { 0 }   // 0 = never expires
```

with **zero cross-contract calls and zero storage reads**.

**The qualification:** `assert_playable` (`token_component.cairo:1179-1200`) checks **four** things,
and only two are derivable from the id:

| assertion | source | derivable from the id? |
|---|---|---|
| `!metadata.game_over` | `token_mutable_state` **storage** | **no** |
| `!metadata.completed_objective` | `token_mutable_state` **storage** | **no** |
| `lifecycle.can_start(now)` | token id | **yes** |
| `!lifecycle.has_expired(now)` | token id | **yes** |

The two storage-backed checks are what make `assert_is_playable` cost 160,000 rather than ~0. But
**the game already knows both of them, more accurately than the token does**:

- `game_over` on the token is a lagging mirror of `adventurer.health == 0`. Death Mountain asserts
  liveness itself in *every* subsystem — `exploration.cairo:123`, `combat.cairo:127`,
  `combat.cairo:301`, `market.cairo:98`, `inventory.cairo:107,172`, `stat_upgrades.cairo:90`,
  `game_core.cairo:475` — all `assert(!adventurer.is_dead(), Errors::ADVENTURER_DEAD)`, plus a
  separate guard in `start_game` at `game_core.cairo:219-223`. The token's copy is strictly
  redundant *and* strictly staler.
- `completed_objective` is computed live from XP by the game
  (`game_token.cairo:389-399`); nothing is persisted game-side. The token's copy is a cache of a
  function the game evaluates anyway.

**Design consequence.** `begin_action` performs:

1. one storage read — the ERC-721 owner — and compares it to `caller`;
2. pure `DivRem` arithmetic on the id for the start/expiry window;
3. **no** `game_over` / `completed_objective` read; the game asserts those in its own frame where
   it already has the adventurer.

That is one storage read plus arithmetic, against today's 200,000 gas of two cross-contract calls.

**This pattern is already proven in production, by Death Mountain, against real money.** Four
dungeon contracts enforce expiry with exactly this arithmetic today, because `assert_playable` is
not reachable from a claim path:

```cairo
// contracts/src/dungeons/greed.cairo:203-206
let minted_at = unpack_minted_at(adventurer_id);
let end_delay = unpack_end_delay(adventurer_id);
let expires_at = minted_at + end_delay.into();
assert(get_block_timestamp() < expires_at, 'Game Expired');
```

Identically at `hyper_greed.cairo:636-638` and `opus_yield.cairo:753-756`; the client mirrors it at
`usePlayableTokens.ts:8-11`.

**A latent bug to fix while doing this, not to copy.** All four of those sites omit `start_delay`.
They are correct *only* because every Death Mountain dungeon passes `start = Some(now)`, so
`start_delay == 0` on every token minted to date. That is an undocumented invariant one tournament
mint away from breaking. **`begin_action` must implement the full `minted_at + start_delay +
end_delay` form**, and the dungeon claim paths should be corrected to match.

**Lifecycle capability is preserved in full.** Minting with start/end delays, playability windows,
never-expiring tokens (`end_delay == 0`), and retroactive-start clamping all survive unchanged —
they are properties of the id encoding, which does not move.

---

## 4. Score architecture

### 4.1 The three candidates, judged

**Option A — write-once at game end (push).** The game calls `settle(token_id, score, game_over)`
once, passing values it already holds. Token metadata is authoritative after settlement; before it,
the token holds nothing.

- *Cost:* one syscall + one storage write + one event, ~150,000 gas, once per game.
- *Today:* correct at end; mid-game the token knows nothing on its own.
- *Under client-side proving:* **this is exactly the settlement transaction.** No change needed.

**Option B — pull / view.** `token_uri` and `score()` read live from the game contract; the token is
never written during play.

- *Cost:* zero on chain. Views are free.
- *Today:* perfectly correct and already how `token_uri` gets the score
  (`denshokan.cairo:322-324` calls `score` on the game contract).
- *Under client-side proving:* **breaks.** The chain does not have the score. A view call returns
  the state as of the last settlement, which may be game start.

**Option C — event-only with indexer aggregation.** The game emits its own event; the token never
learns the score; the indexer aggregates.

- *Cost:* zero marginal — Death Mountain already emits `GameEvent` on every action and its own
  indexer already consumes it. Adding nothing adds nothing.
- *Today:* strictly better latency and richer data than the status quo. The Denshokan indexer's
  current path is a 30-second poll of a 40 KB blob; a `GameEvent` subscription is real-time and
  carries the full adventurer.
- *Under client-side proving:* no events during play, so no live score — but that is a property of
  proving, not of this choice. At settlement the event exists.

### 4.2 Recommendation

**Adopt A as the on-chain truth, C as the liveness mechanism, and B as a read-through fallback.
Delete the push-per-action entirely.**

Concretely:

1. **One mutating state transition per token: `settle`.** Callable only by the game contract.
   Monotonic (`game_over` false→true only, `completed_objective` false→true only, `score` set once).
   Emits `GameSettled { token_id, score, completed_at }` **and one** ERC-4906 `MetadataUpdate`.
2. **`score(token_id)` and `token_uri` read through to the game contract when the token is
   unsettled**, and from local storage once settled. Views cost nothing, so mid-game metadata stays
   exactly as correct as it is today — arguably more correct, since it is computed at read time
   rather than at the last write.
3. **Live score is served from the game's own event stream, not from the token.** Death Mountain's
   indexer already does this. Denshokan's indexer should subscribe to the game contract's events
   for games that expose them, and fall back to `token_uri` polling only for games that do not.

### 4.3 Why, in one argument

**The current architecture spends 4,110,720 L2 gas per action to trigger a ~30-second-latency,
~40 KB polled read.** That is not a live-score system; it is a cache-invalidation ping with a very
expensive doorbell. The measured pipeline (§1.6) is: `update_game` → ERC-4906 → dirty flag → 30 s
poll → `token_uri` → base64 decode → grep `trait_type == "Score"` → Postgres row trigger →
WebSocket. Every step after the first is off-chain and free; the first step costs 36.9 % of every
transaction.

Options B and C are both strictly better than that *today*. The reason to choose A **as well** is
the proving future: under client-side proving the chain has no live state to view and no events to
aggregate until settlement, so B and C both go dark mid-game. A is the only one of the three that
is unchanged by proving — because "write once, at the end, with values supplied by the prover" *is*
the settlement model. Building A now means the token contract needs **no changes at all** when
proving lands; `settle` is already the settlement entrypoint.

This is what "game-centric rather than tx-centric" means concretely: the token contract's write
schedule is *one write per game*, and its dependency on the chain knowing anything mid-game is
*zero*.

### 4.4 What this costs in fidelity, honestly

- **Mid-game token metadata.** Unchanged from the `gas-cleanup` status quo in practice, and
  slightly better: read-through means `token_uri` is always current at read time rather than
  current-as-of-the-last-`update_game`.
- **Abandoned games** (never died, never surrendered — the majority; measured settlement rate is
  ~0.295) never call `settle`, so their token never records a score. Today they never latch
  `game_over` either, so this is not a regression, but it does mean the canonical on-chain record of
  most games is "minted, never settled". Read-through covers the display case.
- **ERC-4906 signals drop from ~49 per game to 1.** Marketplaces refresh less often mid-game and
  are correct at the end. Given that the only consumer measured is Denshokan's own 30-second poller,
  this is a saving, not a loss.

---

## 5. Gas model

### 5.1 Method and confidence

**Method.** Every "today" number below is a direct mainnet measurement taken during this analysis
via `starknet_traceTransaction`, with self-gas attribution per `(contract, entrypoint)` — the same
method as `COST-MODEL.md`, which it independently reproduces. Sample: 10 action transactions
(16 game actions) at blocks 12,321,0xx, plus 3 mint transactions. Selectors were resolved by
computing `sn_keccak` locally and matching against the trace.

**Prices**, from `COST-MODEL.md`: 3.0628e-8 STRK/gas, STRK = $0.029954. So **1 M L2 gas = $0.000917**.
Cross-check: 590.6 M × $0.000917 = $0.5418 ✓ (published $0.542); 328.4 M × $0.000917 = $0.3013 ✓
(published $0.301).

**Envelope**, from `COST-MODEL.md`: 31.4 tx/game, 1.57 actions/tx ⇒ **49.3 actions/game**.

**Confidence.**

| input | confidence | why |
|---|---|---|
| `owner_of` = 40,000/action | **high** | 16 observations, zero variance |
| `assert_is_playable` = 160,000/action | **high** | 16 observations, zero variance |
| `update_game` = 4,110,720/action | **high** | 13 of 16 exactly; 3 at 4,150,720–4,390,720 |
| registry `game_address_from_id` = 600,000 | **high** | calldata and result confirmed |
| `mint` = 2,771,200 | **medium-high** | 2 clean observations + 1 variant |
| replacement `begin_action` marginal ≈ 15,000/action | **medium** | one storage read at the `gas-cleanup`-measured ~14.5 k/read, plus arithmetic |
| replacement `settle` ≈ 200,000/call | **medium** | syscall floor 40 k + a packed write + events; not measured |

The **savings** are high-confidence (they are deletions of measured quantities). The **residuals**
are medium-confidence estimates. Since the residuals are ~6 % of the savings, the headline is robust:
a 2× error in the residuals moves the answer by <7 %.

### 5.2 The baseline, and one correction to it

`gas-cleanup/AUDIT.md` §6 projects **328.4 M gas/game, $0.301**. Its arithmetic subtracts
`29.4 × 6.73 M`, i.e. it applies the *per-transaction* `update_game` figure to a *per-call* event,
leaving `2 × 6.73 M = 13.46 M` retained. By direct measurement the retained cost is
`2 × 4,110,720 = 8.22 M`. **The published baseline is therefore ~5.2 M/game pessimistic** — the true
`gas-cleanup` figure is closer to **323.2 M, $0.296**. I use the published 328.4 M below so the
comparison is apples-to-apples with the audit, and note that this makes Lite's marginal saving look
marginally *better* than it is.

### 5.3 Denshokan's total footprint, before and after

This is the clearest way to see what each step buys.

| | `update_game` | `owner_of` + `assert_is_playable` | `mint` | **total/game** | **share of the game** |
|---|---:|---:|---:|---:|---:|
| **today** | 31.4 tx × 6.73 M = 211.3 M | 31.4 × 0.32 M = 10.0 M | 2.77 M | **224.1 M** | **38 %** of 590.6 M |
| **after `gas-cleanup`** | 2 × 4.11 M = 8.2 M | 10.0 M | 2.77 M | **21.0 M** | **6.4 %** of 328.4 M |
| **after Denshokan Lite** | 2 × 0.2 M = 0.4 M | 49.3 × 15 k = 0.74 M | 1.11 M | **2.25 M** | **0.72 %** of 311.5 M |

**The token standard goes from 38 % of a game's gas to 0.7 %. `gas-cleanup` does 38 → 6.4.
Denshokan Lite does 6.4 → 0.7.** Both matter; the first is much larger.

### 5.4 Marginal saving over the `gas-cleanup` baseline

**Per action.**

| item | today (post-cleanup) | Lite | saving |
|---|---:|---:|---:|
| `owner_of` | 40,000 | fused | |
| `assert_is_playable` | 160,000 | fused | |
| `begin_action` marginal over the settings call GameCore already makes | — | ~15,000 | **185,000** |
| amortised `settle` (2 × 200,000 replacing 2 × 4,110,720) ÷ 49.3 actions | 166,700 | 8,100 | **158,600** |
| **per action** | | | **≈ 343,600** |

**≈ 344 k L2 gas/action ≈ $0.00032/action ≈ 5.2 %** of the post-cleanup per-action cost
(328.4 M ÷ 49.3 = 6.66 M).

**Per game.**

| step | gas/game | $/game |
|---|---:|---:|
| today | 590.6 M | $0.542 |
| **`gas-cleanup` baseline** | **328.4 M** | **$0.301** |
| − fuse `owner_of` + `assert_is_playable` into the settings call | −9.12 M | −$0.0084 |
| − replace `update_game` with push `settle` | −7.82 M | −$0.0072 |
| **Denshokan Lite** | **311.5 M** | **$0.286** |

**Marginal: 16.94 M gas/game = $0.0155/game = 5.2 %.**

Framed against what is actually controllable: the account + session + fee-transfer floor is
2,408,043/tx × 31.4 = **75.6 M/game and untouchable**. Of the 252.8 M controllable gas at the
`gas-cleanup` baseline, Lite removes **6.7 %**.

**Per mint.** The mint is a separate transaction that emits no `GameEvent`, so it is **not** inside
the 31.4 tx/game or the $0.542. Greed Run's `buy_game` measured 7,297,840 L2 gas total.

| item | today | Lite | saving |
|---|---:|---:|---:|
| `mint` self (ERC-721 + Enumerable + minter + pack) | 1,091,200 | 1,091,200 | 0 |
| 2 × SRC5 probes + `settings_address` + `game_id_from_address` | 160,000 | 0 | **160,000** |
| `settings_exist` (69-slot whole-struct read) | 1,520,000 | ~15,000 | **1,505,000** |
| **Denshokan `mint` subtree** | **2,771,200** | **~1,106,000** | **1,665,000** |

**But only 160,000 of that is attributable to Denshokan Lite.** The 1,505,000 is Death Mountain's
own `settings_exist` whole-struct read (§1.4) and is fixable today with a one-line change to
`game_token.cairo` — no Denshokan change, no migration. Counting it as a Lite saving would be
exactly the double-count the brief warns against.

- Lite-attributable mint saving: **160,000 gas = $0.00015/mint.**
- Available-today mint saving: **1,505,000 gas = $0.0014/mint** (ship this regardless).
- Together: the mint transaction drops **7.30 M → 5.63 M, −23 %.**

### 5.5 Verdict, stated plainly

**Denshokan Lite is worth about $0.016 per game — a 5.2 % reduction on top of `gas-cleanup`. That
is small, and the gas case alone does not justify the project.**

`gas-cleanup` already captured the large win ($0.542 → $0.301, 44 %). What is left of Denshokan on
the hot path is 200,000 gas per action and two callbacks per game. Removing them is worth doing,
but it is a tidy-up, not a step change.

**The architectural case is separate and stronger, and it should be argued on its own terms:**

1. **It removes a shared, upgradeable, third-party contract from the hot path of the only
   successful onchain game.** Death Mountain's per-action cost is currently hostage to a contract
   it does not own, does not upgrade, and shares with two unrelated games. The 600,000-gas registry
   read is a live example: a one-line fix Death Mountain cannot make.
2. **It is the right shape for client-side proving.** `settle(token_id, score, game_over)` *is* the
   settlement call. Under the current design, settlement would have to call `update_game`, which
   would call back into the game to re-derive a score the prover just proved. Lite makes the token
   contract proving-agnostic.
3. **It removes the 30 s / 40 KB poll from the live-score path**, replacing it with the game's own
   event stream — which for Death Mountain already exists and is already consumed.
4. **It ends the double-count of `minted_by`, `settings_id` and lifecycle** across five decoder
   implementations by making the layout stable and self-describing (`format` bits).

If the decision is "not worth the migration risk for $0.016", that is a defensible reading of these
numbers, and the fallback is cheap: **ship the `settings_exist` one-liner and stop there.** But the
proving argument is a forcing function on a timescale, and the migration only gets harder as the
token count grows past 67,217.

---

## 6. Migration

### 6.1 The constraint set

| fact | consequence |
|---|---|
| 67,041 live Death Mountain tokens with `game_id = 1` | cannot be reissued cheaply |
| 176 zKube + zordle tokens in the same collection | **Denshokan cannot be unilaterally converted** — it serves two third-party games |
| Denshokan's Enumerable component asserts `BURN_NOT_SUPPORTED` (`enumerable.cairo`, `before_update`) | **burn-and-reissue is impossible** without upgrading Denshokan |
| Merkle-claim dungeons hardcode `soulbound = true` (community, multi_community, gigaverse) | those tokens **cannot be transferred to a bridge** |
| Greed 72 h / Hyper Greed 24 h expiry; Beast Mode and Karat mint with `end = None` | most tokens self-expire; a long tail never does |
| `GameCore` has **no setter** for `minigame_token_address` (constructor-only, `game_core.cairo:189`) | repointing requires a **contract upgrade** (it is upgradeable, `game_core.cairo:669`) |
| Only 4 of 8 minting dungeons have `set_denshokan_address` (greed, gigaverse, community, multi_community) | hyper_greed, karat, duckies, opus_yield need **upgrades** (all are upgradeable) |

### 6.2 Options considered

**(a) Bridge / wrap — rejected.** Burning on Denshokan is blocked by the Enumerable component, and
soulbound tokens cannot be moved to a bridge contract at all. Would require upgrading Denshokan,
which is shared.

**(b) Convert Denshokan itself into the Lite shape — rejected.** It holds zKube and zordle tokens.
Removing multi-game support unilaterally breaks two third-party games for a 0.26 % share.

**(c) New collection alongside old, with dual-read in the game — recommended.**

### 6.3 The recommended migration

**Nothing is migrated. Both collections run in parallel; the old one drains naturally.**

1. Deploy the factory. Deploy the Death Mountain Lite token via it. Seed its minter table (§6.4).
2. Upgrade `GameCore` to **dual-read**. The dispatch is a 4-bit test on the token id, free:

   ```cairo
   let format = (token_id_low >> 26) & 0xF;          // 0 = legacy, 1 = Lite
   let token = if format == 0 { self.legacy_token.read() }
               else            { self.lite_token.read() };
   ```

   Legacy ids keep the old path (`owner_of` + `assert_is_playable` + `maybe_post_action` against
   Denshokan, exactly as `gas-cleanup` leaves it). Lite ids take the new path. **This is why
   `format` lives at bits 26–29** — the discriminator is unambiguous against all 67,217 existing
   tokens (§2.3).
3. Repoint the minting dungeons one at a time. Four have setters; four need upgrades.
   **Repoint low-volume dungeons first** to bound blast radius.
4. Leave Denshokan untouched and running. `update_game` remains permissionless there, so legacy
   token metadata stays refreshable by anyone, forever.
5. After the last never-expiring legacy token is settled or abandoned, the dual-read branch can be
   removed. There is no deadline; the branch costs ~14.5 k gas.

### 6.4 The `minted_by` hazard — read this one

**This is the migration's sharpest edge and it is easy to miss.**

`minted_by` is an index into Denshokan's **global** minter table, assigned by
`MinterComponent::add_minter` from a shared counter (`minter.cairo:70-89`). There are **45**
registered minters. A freshly deployed Lite contract restarts that counter at 1, so **Beast Mode
would be minter 1 on Lite and 19 on Denshokan.**

That silently breaks:

- `contracts/src/dungeons/lootsurvivor_yield.cairo:805` —
  `assert(unpack_minted_by(adventurer_id) == self.lootsurvivor_minter_id.read(), 'Wrong dungeon')`,
  with the mainnet id 19 stored in state. A Lite token minted by Beast Mode would unpack to 1 and
  be rejected — or, worse, a *different* dungeon that happened to land on id 19 would be accepted.
- Every off-chain minter-id → dungeon mapping (19 = Beast Mode, 9 = Greed Run, 15 = Lil Duckies,
  30 = OPUS Yield, 38 = Budokan, 40 = Hyper Greed, 42 = gigaverse), which is how the Death Mountain
  indexer and API attribute games to dungeons — `indexer/src/lib/decoder.ts:51-56` unpacks
  `minted_by` locally for exactly this purpose.
- `combat.cairo:75,467,532`, `exploration.cairo:72,200,492`, `gigaverse.cairo:542`,
  `duckies.cairo:330`, `karat.cairo:274` — all read `unpack_minted_by`.

**Mitigation, and it is mandatory:** the Lite token contract must expose a one-shot,
owner-only `seed_minters(Span<(u64, ContractAddress)>)` executed at deploy, importing all 45
existing `(id, address)` pairs verbatim and setting the counter to 46. Add a test that asserts the
mapping is byte-identical to Denshokan's for every id, read from mainnet.

**This is also a real cost of leaving the shared collection**, and it should be named as such: the
global minter namespace was a genuine benefit of a single contract. Per game, ids must be seeded and
thereafter diverge between games.

### 6.5 What breaks, concretely

| party | impact | mitigation |
|---|---|---|
| **Holders of legacy tokens** | Nothing. Old tokens stay playable via the dual-read branch; nothing is burned, moved or reissued. | none needed |
| **Wallets** | Two collections appear instead of one. | cosmetic; resolves as legacy tokens expire |
| **Marketplaces** | Collection identity splits. Floor price, volume and holder history do not carry over. **This is the largest non-technical cost.** | pre-announce; ask the major venues to link the collections; the Lite contract should reuse the same `name`/`symbol` shape |
| **Royalties** | Today the receiver is the owner of registry token #1 and the fraction is **0**. Lite uses a flat owner-settable `(receiver, bps)`. | behaviour-preserving at 0; set explicitly at deploy |
| **Death Mountain dungeons** | 4 need a `set_denshokan_address` call, 4 need upgrades. Claim paths read GameCore directly and are unaffected. | sequence per §8 |
| **Death Mountain indexer / API / spectate** | **None.** They consume GameCore's `GameEvent`; the Denshokan address appears nowhere in `indexer/apibara.config.ts`. | none |
| **Death Mountain client** | Must decode both formats and query both collections during the overlap. | `format` bits make this a 4-bit test; layout is otherwise unchanged |
| **Denshokan indexer / API** | `apibara.config.ts` has a single `contractAddress`. Needs a multi-address config to index factory-deployed collections. | small change; the DB is already `(game_id, …)`-partitioned |
| **Denshokan SDK** | `getTokenScores`, `getTokenRank`, `getPlayerStats`, `getMinters` are **API-only with no on-chain fallback** — they hard-depend on the cross-game indexer DB. | those endpoints must learn about factory-deployed collections |
| **zKube, zordle** | **None.** Denshokan is not modified. | none |
| **Budokan (tournaments)** | See §6.6 | **must be verified** |

### 6.6 Budokan — what I could establish, and what must be verified

**Budokan is not vendored in either repository.** I could not read its source. But it is live, it is
minter id **38** (`0x12eb6054aa269c3e60013693f650650d81952de60072f446406d2a89f0b518e`), and I traced
one of its mints (`0x38ad548b3554fa073bdab858ce227e5871334821d0ebe4a978539e89d7d223a`). Inside its
entrypoint it calls, in order:

1. `transfer_from` on an ERC-20 (the entry fee),
2. **`token_address()` on Death Mountain's `GameToken`** (`0x4de03…`, selector
   `0xb59f37c0f9d09e…`, 40,000 gas),
3. `mint` on Denshokan (`0x263cc…`, 2,971,200 gas),
4. `token_address()` on `GameToken` again,
5. `owner_of` on Denshokan.

**This is very good news, if it generalises.** Budokan appears to **discover the token contract by
asking the game contract**, not by holding a hardcoded Denshokan address. If so, repointing
`IMinigame::token_address()` on Death Mountain's `GameToken` to the Lite contract would carry
Budokan across with no changes on their side.

**What must be verified against the deployed Budokan source before committing to this:**

- Is `token_address()` genuinely the discovery mechanism, or is it a validation check against an
  address supplied in the tournament configuration? Both are consistent with the trace.
- Does Budokan implement `IMetagameCallback` (`on_game_action` / `on_game_over` /
  `on_objective_complete`)? The `gas-cleanup` audit found **no production implementor anywhere in
  the vendored game-components tree**, and in my traces the SRC5 probe against the minter reported
  0 gas — consistent with a reverted-and-caught call, i.e. "does not implement it". But minter 38 was not
  the minter in the action traces I took, so this is **not** established for Budokan specifically.
  If Budokan *does* implement `on_game_over`, Lite's `settle` must call it.
- Does Budokan read the token's persisted `game_over` flag, or the game's live score? The
  leaderboard component in game-components reads live from the game
  (`metagame/src/leaderboard/leaderboard_component.cairo:175`), and `presets/leaderboard.cairo:22-24`
  documents `submit_score` as deliberately unvalidated — both suggest live reads. Confirm.
- `MinigameComponent::initializer` sets `token_address` at construction with no setter. Repointing
  it needs a `GameToken` upgrade plus a new owner-only setter.

**Recommendation: treat Budokan as a hard gate.** Obtain the deployed class hash, decompile or
obtain source, and confirm all four points before step 6 of the sequence in §8.

---

## 7. What we lose, honestly

**1. Cross-game discovery.** `GET /games` and its genre/developer/publisher facets are the product
feature Denshokan was built for. Under a factory the on-chain list becomes the factory's event log
plus its `token_at(index)` array — functionally equivalent, but the *curation* that a permissionless
registry provided (a game "appears" by registering) moves off chain.
*Mitigation:* the indexer subscribes to the factory and surfaces exactly the same list. The
`games` table needs no schema change; only its source changes.
*Residual loss:* real, but the population is 3.

**2. Unified marketplace collection.** One collection with 67,217 tokens becomes N collections.
Floor price, volume, holder counts and rarity rankings do not carry over, and marketplace UIs treat
them as unrelated. **This is the most concrete loss in the whole plan and it is not technically
mitigable** — only socially, by asking venues to link them. Note the counterweight: 99.74 % of the
collection is one game, so the "unified" collection is already, in practice, the Death Mountain
collection with 176 tokens of noise.

**3. One indexer serves all.** Replaced by one indexer that reads a factory and then N addresses —
a config change, not an architecture change (`apibara.config.ts` currently hardcodes a single
`contractAddress`). The DB is already per-game partitioned: `tokens_game_score_idx` and
`tokens_game_over_updated_idx` are `(game_id, …)`-leading, and `objectives`/`settings` are uniquely
keyed on `(game_address, id)`.

**4. The global `minted_by` namespace.** 45 minters share one id space across all games today.
Per game they must be seeded and will thereafter diverge. See §6.4 — this is the sharpest edge in
the whole migration.

**5. Cross-game player stats.** `GET /players/:address/stats` computes
`countDistinct(tokens.gameId) as gamesPlayed`. Under per-game contracts this becomes a union across
collections — still computable by the indexer, but it stops being a single index scan.

**6. Tournament / metagame integrations expecting the Denshokan interface.** Budokan is the live
case; see §6.6. Any other integrator holding the Denshokan address as a constant must be repointed.
*Mitigation:* keep the Lite token's ABI a strict subset of the Denshokan interface for everything
except `update_game` — same `token_metadata` shape minus `game_id`, same `is_playable`,
`player_name`, `minted_by_address`, `score`, `owner_of`. An integrator that never calls
`update_game` should not notice the swap.

**7. Permissionless game registration.** Today `register_game` is open and mints a creator ERC-721
whose owner receives royalties. Under a factory, if `deploy_token` is permissioned, that openness is
lost.
*Mitigation:* leave `deploy_token` permissionless and record the deployer; move curation to the
indexer's allow-list.

**8. One deployment instead of N.** Every new game now needs a contract deployment. That is a real
operational cost — offset by the fact that every new game already deploys 5–7 contracts.

---

## 8. Implementation sequence

Ordered so the riskiest and least reversible steps come last. Effort is engineer-days including
tests and review.

| # | step | effort | risk | reversible? |
|---|---|---:|---|---|
| **0** | **Ship the `settings_exist` one-liner** in Death Mountain's `game_token.cairo` (§1.4). 1.5 M gas/mint, no Denshokan change, no migration. Do this whether or not the rest proceeds. | **0.5 d** | very low | yes |
| **1** | **Verify Budokan** (§6.6). Obtain the deployed source/class hash; confirm the four open questions. **Gate on this.** | 1–3 d | — | n/a |
| **2** | Write `DenshokanLiteToken` + `DenshokanLiteFactory`. Port `CoreToken`, `Minter`, `Objectives`, `Settings`, `Context`, `Renderer` minus all `game_id` routing. Full test suite including a fuzz test that the v2 layout round-trips and that `format` correctly discriminates every one of the 67,217 live ids. | 8–12 d | low | yes |
| **3** | Add `format`-aware decoding to the three TS layout copies (indexer, client, SDK) — **additive only**, both formats supported. Delete the dead `client/src/utils/packed-token-id.ts`. Ship ahead of any contract change. | 2–3 d | low | yes |
| **4** | Deploy factory + Death Mountain Lite token to **Sepolia**. Seed the minter table from mainnet's 45 entries and assert byte-identity. Run a full game end-to-end. | 3–4 d | low | yes |
| **5** | Benchmark on Sepolia: `begin_action`, `settle`, `mint`. **Replace the medium-confidence residuals in §5.1 with measurements** and re-publish the table. If the marginal saving comes in materially below $0.0155/game, stop and reconsider. | 2 d | — | n/a |
| **6** | Add the `token_address()` setter to Death Mountain's `GameToken` and upgrade it (needed for Budokan repointing, §6.6). | 1–2 d | medium | yes (re-upgrade) |
| **7** | Upgrade `GameCore` to **dual-read** (§6.3). Legacy path byte-identical to `gas-cleanup`. Ship with both paths live and **no dungeon repointed** — so nothing changes in production yet. | 3–5 d | medium | yes (re-upgrade) |
| **8** | Deploy factory + Lite token to **mainnet**. Seed minters. Mint and play one game end-to-end with an internal account. Still no dungeon repointed. | 1 d | low | yes (abandon it) |
| **9** | **Repoint the lowest-volume dungeon first** (Karat or Duckies — needs an upgrade, so bundle the setter). Observe for a full expiry cycle. | 2 d | medium | yes |
| **10** | Repoint remaining dungeons in ascending volume order: gigaverse, Hyper Greed, Greed Run, **Beast Mode last** (39,783 all-time games). Four have setters; four need upgrades. | 3–5 d | **high** | yes, but each repoint splits the collection further |
| **11** | Update the Denshokan indexer to multi-address + factory subscription; update the SDK's API-only endpoints. | 4–6 d | low | yes |
| **12** | *(optional, much later)* Remove the dual-read branch once no unexpired legacy token remains. | 1 d | low | — |

**Total: ~30–45 engineer-days**, of which steps 0–5 (~17–24 d) are fully reversible and produce a
measured answer before anything touches production.

**Two explicit stop-gates.** After step 1 (Budokan unverified ⇒ stop). After step 5 (measured
saving materially below projection ⇒ stop, having spent ~20 days and shipped step 0's $0.0014/mint
for free).

**Deployment atomicity.** Unlike the `gas-cleanup` upgrade — which *had* to be a single atomic
multicall across five contracts because `ActionSettings` changed a shared ABI — this migration is
**incremental by construction**. Dual-read means legacy and Lite coexist; each dungeon repoint is
independent; nothing requires a flag day. That is a deliberate design property and the main reason
to prefer option (c) in §6.2.

---

## 9. Open questions for the reviewer

1. **Is a 5.2 % marginal gas saving worth this migration?** I have argued no on gas alone, yes on
   architecture and proving-readiness. That is a judgement call about timing, not about numbers.
2. **Should the Lite token be merged into Death Mountain's `GameToken`, or stand alone?** Merging is
   where most of the saving comes from (the three-syscalls-to-one fusion). Standing alone is more
   reusable across games. My recommendation is merged for Death Mountain, with the factory shipping
   a *default* standalone class for games that do not want to merge — but this makes the "factory
   deploys one canonical class" story messier and deserves scrutiny.
3. **`begin_action(token_id, caller)` moves the ownership assertion into the token's frame with a
   caller supplied by the game.** This is the one place Lite is less obviously safe than today.
   Needs a dedicated security review.
4. **Do we keep the Enumerable component?** It writes two storage slots per mint and per transfer.
   The API provides enumeration already. Dropping it would shave the mint further but breaks
   `token_of_owner_by_index` for any integrator using it.
5. **Should `deploy_token` be permissionless?** §7 item 7.

---

## Appendix — reproduction

```bash
RPC=https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10
DEN=0x00263cc540dac11334470a64759e03952ee2f84a290e99ba8cbc391245cd0bf9
REG=0x02cbaec07913d3580822e5811e575ab657ee0362c022b8df56214cb6ca95fe06
GC=0x023f86f5b4702f6ba114b82fb73448c58aad8f37a28b508b80bf129ee1edc405

# three games, total
curl -s -X POST $RPC -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,
  "method":"starknet_call","params":[{"contract_address":"'$REG'",
  "entry_point_selector":"0x1d55efd97f545ec44e0fd06c1dbe204019dfc943d1ecf42c92948a7fa571dde",
  "calldata":[]},"latest"]}'                                        # game_count -> 0x3

# game_address_from_id(1) -> 0x4de0351ceab4...  (600,000 gas inside update_game)
curl -s -X POST $RPC -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,
  "method":"starknet_call","params":[{"contract_address":"'$REG'",
  "entry_point_selector":"0xeae82002af973fe1002a0542447f64187a47c4a4922ffe234ffe9ceb213bca",
  "calldata":["0x1"]},"latest"]}'

# a single-action tx: owner_of 40,000 | assert_is_playable 160,000 | update_game 4,110,720
curl -s -X POST $RPC -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,
  "method":"starknet_traceTransaction",
  "params":["0x23bc71ced5848488824b318efd884d1a3f80b9ff5b2b4c29574ad88ce1430dd"]}'

# a mint tx: Denshokan mint 2,771,200, of which settings_exist is 1,520,000
curl -s -X POST $RPC -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,
  "method":"starknet_traceTransaction",
  "params":["0x690daa55c3a8ca80993a56c9038f5bcdc69d2efccf766422bd0ed80a73add7c"]}'

# collection composition
curl -s 'https://denshokan-api-production.up.railway.app/tokens?limit=1&include_uri=false'  # total 67217
curl -s 'https://denshokan-api-production.up.railway.app/tokens?game_id=1&limit=1&include_uri=false'  # 67041
curl -s 'https://denshokan-api-production.up.railway.app/minters?limit=1'                   # total 45
curl -s 'https://denshokan-api-production.up.railway.app/games/1'                           # royaltyFraction "0"
```

**Source references.** game-components at rev `e24bf41` (pinned in Death Mountain's
`Scarb.lock:86`), vendored at
`/home/ubuntu/.cache/scarb/registry/git/checkouts/game-components-9b1icgvvqc04e/e24bf41/`.
Death Mountain at `/workspace/super-death-mountain`; the `gas-cleanup` worktree and its
`gas-cleanup/AUDIT.md` at `.claude/worktrees/gas-cleanup/`. Cost model at
`git show commit-reveal-rng:commit-reveal/COST-MODEL.md`.

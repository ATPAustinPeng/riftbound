# Score Tracking Tab ("Scores") — Implementation Plan

## Context

The tracker app currently covers collection management (4 tabs: Browse, Collection, Wishlist, Profile). This adds a **score tracking tab** so players can record Riftbound matches live: matchup, Bo1/Bo3, starting player, per-game setup (battlefield selection, side-in/out, mulligans), and — most importantly — a detailed per-turn scoring log: **which player scored, on which turn, from which battlefield, and how** (conquer / hold / effect), including **draw-instead-of-score** events. Long-term, an audio model will infer game actions to detect misplays/illegal moves, so the per-game event log must be **append-only, timestamped, ordered, and extensible**.

### Rules grounding (official Rules Hub only: https://playriftbound.com/en-us/rules-hub/)

Items marked *(verify)* must be confirmed against the Core Rules / Tournament Rules PDFs in Phase 0 before the migration is written.

- **Ways to score (3)**: **conquer** (1 pt on taking control of a battlefield), **hold** (1 pt per battlefield you control at the start of your turn), **card effects**.
- **Once-per-battlefield-per-turn**: on each turn, each player can score at most once per battlefield — conquering a battlefield you already scored from this turn does not score again *(verify exact wording)*.
- **Draw-instead-of-score**: when a player would score but can't (once-per-turn limit already used, final-point rule), they **draw a card instead** — explicitly tracked with a reason.
- **Game modes & win targets** *(verify per mode)*:
  - **1v1**: 2 battlefields in play (each player brings one; 1 Legend per player); race to **8 points**.
  - **2v2**: race to **11 points** (team scoring).
  - **FFA**: multiplayer free-for-all; own scoring rules.
  - MVP tracks **1v1 only**, but the schema records the mode so 2v2/FFA can be added without migration.
- **Win target is dynamic, not a constant**: some battlefields increase the required score by 1, and these effects **stack** (e.g. two such battlefields → first to 10 in 1v1). The target is therefore a **per-game value** (base 8/11 by mode + battlefield modifiers), and scores can legally exceed 8 *(verify which battlefields and exact stacking behavior)*.
- Bo3: a battlefield may not be reused across games in a match *(verify)*.
- Mulligan: draw 4, set aside up to 2, redraw *(verify)*.
- **Authoritative rule documents (8, all linked from the Rules Hub):**
  1. **Core Rules PDF** (`cmsassets.rgpub.io/...861747d1d4d505b7c14d73aba9749d1c3a209a67.pdf`, upd. 3/30/26)
  2. **Tournament Rules PDF** (`cmsassets.rgpub.io/...e70866614d68a00a1cbd12c7de08124e0ea5e755.pdf`, upd. 4/29/26)
  3–5. **Patch notes per set (3)**: Origins (`/riftbound-core-rules-patch-notes/`), Spiritforged (`/riftbound-core-rules-spiritforged-patch-notes/`), Unleashed (`/riftbound-core-rules-unleashed-patch-notes/`) — web articles, no PDFs.
  6–8. **Errata per set (3)**: Origins (`/riftbound-origins-card-errata/`, links its own PDF `...5bcbb23c…pdf`), Spiritforged (`/riftbound-spiritforged-errata/`), Unleashed (`/unleashed-errata-updates/`).
- The two rules PDFs exceed WebFetch's 10 MB limit and downloads are blocked in plan mode → **Phase 0 of implementation downloads them to the scratchpad and reads them page by page (Read tool, ≤20 pages/request)**, plus reviews the 3 patch-notes pages and 3 errata pages, to verify terminology and fill gaps (starting-player determination, sideboard size/procedure, exact final-point wording) before writing the migration.

### Decisions made with the user

- New 5th tab alongside the existing 4; tab = match history + New Match entry.
- **Local-first with Supabase sync** (live tracking offline-safe; persisted at checkpoints).
- **Me vs opponent, single device**; opponent has no account.
- Matchup via **Legend picker from cards DB**. `cards.card_type` is comma-joined text (`Legend` ×100, `Battlefield` ×56 exist); filter client-side from the cached all-cards query and **dedupe by name** (Legends/Battlefields have multiple printings).

## Phase 0 — Rules verification + CLAUDE.md (first implementation steps)

1. `curl` the Core Rules + Tournament Rules PDFs (and the Origins errata PDF) into the scratchpad; Read page by page (≤20 pages/request); review the 3 patch-notes and 3 errata pages via WebFetch. Confirm every *(verify)*-marked rule above (once-per-battlefield-per-turn wording, per-mode win targets for 1v1/2v2/FFA, which battlefields raise the win target and how stacking works, Bo3 battlefield no-reuse, mulligan counts, sideboard rules, starting-player determination) and correct any plan assumptions that conflict before the migration.
2. Update root `CLAUDE.md` with a **Data sources** section: game rules only from https://playriftbound.com/en-us/rules-hub/ and the 8 documents it links — Core Rules PDF, Tournament Rules PDF, per-set patch notes (currently 3: Origins, Spiritforged, Unleashed), per-set errata (currently 3) — never from memory or third-party sites; card data only from https://playriftbound.com/en-us/card-gallery/.

## Phase 1 — Data model: `supabase/migrations/0007_matches.sql` (next number; 0006 is latest)

Three tables. All ids **client-generated uuids** (sync idempotency). Each carries denormalized `user_id` so RLS stays `auth.uid() = user_id` (no join policies). Copy the `wishlist` template from `0001_init.sql`: enable RLS + `"own rows"` policy + **explicit GRANTs** to `authenticated` and `service_role` (grants are mandatory per project convention).

**`public.matches`**: `id uuid pk`, `user_id → auth.users on delete cascade`, `format check in ('bo1','bo3')`, `game_mode text not null default '1v1' check (game_mode in ('1v1','2v2','ffa'))` (MVP UI only creates `'1v1'`), `my_legend_card_id`/`opponent_legend_card_id text references public.cards` (opponent nullable = "unknown"), `my_deck_name`/`opponent_deck_name text`, `status check in ('in_progress','completed','abandoned') default 'in_progress'`, `result check in ('win','loss','draw')`, `notes text`, `started_at`/`completed_at`/`created_at`/`updated_at timestamptz`.

**`public.match_games`**: `id uuid pk`, `match_id → matches on delete cascade`, `user_id`, `game_number int`, `starting_player check in ('me','opponent')`, `my_battlefield_card_id`/`opponent_battlefield_card_id → cards`, `my_mulligan_count`/`opponent_mulligan_count int check between 0 and 2` (cards set aside), `side_notes text` (side-in/out), `target_score integer not null default 8` (base by mode + battlefield modifiers; editable — battlefield "+1 to win" effects stack), `status`, `my_score`/`opponent_score int default 0` (written at game end), `winner check in ('me','opponent','draw')`, `started_at`/`ended_at`, `unique (match_id, game_number)`.

**`public.game_events`** (append-only, extensible): `id uuid pk`, `game_id → match_games on delete cascade`, `user_id`, `seq int` (client-assigned monotonic; `unique (game_id, seq)`), `turn_number int`, `actor check in ('me','opponent','system')`, `event_type text` (**no SQL check — validated client-side** so future audio event types need no migration), `battlefield_card_id → cards` (nullable), `points int default 0` (score delta), `payload jsonb default '{}'`, `occurred_at timestamptz` (client wall clock), `created_at`.

- MVP event types: `game_start`, `turn_start`, `score_conquer`, `score_hold`, `score_effect`, `draw_instead`, `undo`, `note`, `game_end`.
- **Append-only undo**: `undo` event with `payload.target_event_id`; reducer skips undone events. No deletes → faithful audit log for the audio model; sync never propagates deletions.
- `draw_instead` payload: `{ reason: 'battlefield_already_scored' | 'final_point_rule' | 'other' }`. `turn_start` payload: `{ active_player }`.
- **Stored vs derived**: live scores always derived by folding events; final scores/winner written to `match_games` and `result` to `matches` at end so history lists never fetch events.

Indexes: `matches (user_id, started_at desc)`, `match_games (match_id)`, `match_games (user_id)`, `game_events (game_id, seq)`, `game_events (user_id)`.

## Phase 2 — Types: `tracker/lib/types.ts`

`PlayerRef = 'me' | 'opponent'`, `MatchFormat`, `MatchStatus`, `MatchResult`, `GameWinner`; `GameEventType` union + `isValidGameEventType()` (the `CollectionGoal` pattern), rows tolerate unknown types (`GameEventType | (string & {})`); interfaces `Match`, `MatchGame`, `GameEvent` (`payload: Record<string, unknown>`); joined helpers `MatchWithLegends` (legends resolved client-side from the cached cards index — no server join), `MatchGameWithEvents`.

## Phase 3 — Score engine: `tracker/lib/score-engine.ts` (new, pure)

- `deriveGameState(events, targetScore): { myScore, opponentScore, turnNumber, activePlayer, scoredThisTurnByBattlefield, undoneEventIds, isOver }` — folds in `seq` order, skips undone events. **No hardcoded 8**: the target comes from `match_games.target_score` (base 8 for 1v1 + stacking battlefield modifiers); scores are never clamped, since the target can exceed 8.
- `baseTargetScore(gameMode)` (8 for `'1v1'`, 11 for `'2v2'`) — game setup pre-fills `target_score` with this and lets the user bump it per battlefield modifier (a stepper), since modifier battlefields are card text we don't parse in MVP.
- `nextSeq(events)`, `buildEvent(...)` (assigns id/seq/turn/occurred_at).
- Soft warnings (never hard-block): `wouldViolateOncePerTurn(state, actor, battlefieldId)` — per the once-per-battlefield-per-turn rule, applied to conquer *and* hold on the same battlefield → UI suggests "record a draw instead?"; flag final-point rule when a score would reach `targetScore`.
- `usedBattlefieldIds(games)` for Bo3 no-reuse.

## Phase 4 — Local-first live store: `tracker/lib/match-store.ts` + `tracker/lib/match-sync.ts`

**No new state library** — follow the existing `useSyncExternalStore` pattern (`tracker/lib/browser-store.ts`) + AsyncStorage persistence (already a dep).

- `ActiveMatchState = { match, games, eventsByGameId, phase: 'match_setup'|'game_setup'|'live'|'game_summary'|'match_summary', sync: { dirtyMatch, dirtyGameIds, lastSyncedSeqByGameId, lastError } } | null`.
- Persist on change (debounced ~300 ms) to `AsyncStorage 'active_match_v1'`; hydrate at init (`isHydrated`); app restart mid-game restores exactly. Cleared after final successful sync.
- Actions: `startMatch`, `startGame`, `appendEvent`, `undoLastEvent`, `advanceTurn`, `endGame(winner)`, `endMatch`, `abandonMatch`.
- UUIDs: add **`expo-crypto`** (`Crypto.randomUUID()`, Hermes + web) — the only new dependency.
- **Sync checkpoints**: insert `matches` at match create; insert `match_games` at game start; debounced (~2 s) batch upsert of unsynced events after `appendEvent`; mandatory flush at game end / match end (also updates result columns). All `.upsert(..., { onConflict: 'id' })` → retries harmless. Offline: failures leave dirty flags; retry at next checkpoint and on screen focus; AsyncStorage is source of truth; small "unsynced" indicator. On match-end flush: invalidate `queryKeys.matches(userId)`, clear the AsyncStorage slot.

## Phase 5 — Hooks: `tracker/lib/queries.ts`

- `queryKeys.matches(userId)`, `queryKeys.matchDetail(matchId)`.
- `useMatchesQuery()` (`fetchAllRows`, `started_at desc`, `enabled: !!user?.id`, client-join legends), `useMatchDetailQuery(matchId)` (match + games + events ordered by `game_number`, `seq`), `useMatchStats()` (client fold: W-L record, win rate), `useDeleteMatchMutation()` (cascade delete, standard optimistic pattern).
- Plain exported async fns for the sync layer (not components): `insertMatch`, `upsertMatchGame`, `upsertGameEvents(events[])`, `updateMatchResult`, `updateGameResult`.
- Picker helpers: `getLegendOptions` / `getBattlefieldOptions` — filter `card_type`, dedupe by name (canonical printing via existing set-order compare), sort by name.

## Phase 6 — Navigation & screens

- **Tab**: new `tracker/app/(tabs)/scores.tsx`; register in `tracker/app/(tabs)/_layout.tsx` (`SymbolView` icon ios `trophy` / android+web `emoji_events`), between wishlist and profile.
- **Stack** (`tracker/app/_layout.tsx`): `match/new` and `match/[id]` as plain push screens.

1. **`(tabs)/scores.tsx`** (model on `wishlist.tsx`): match list (matchup "Viktor vs Jinx", format badge, result badge, date, per-game scores `8–6, 5–8`), `StatCard` record/win-rate header, "Resume match" banner when the store has an active match, prominent **New Match** button; row → `/match/{id}`; delete via long-press.
2. **`app/match/new.tsx`**: Legend pickers (opponent skippable), optional deck-name inputs, Bo1/Bo3 segmented pills (reuse `CollectionGoalSelector` pill pattern), starting player (Me/Opponent/decide later) → `startMatch` → `router.replace('/match/{id}')`.
3. **`app/match/[id].tsx`** — phase machine from `matchStore.phase`; falls back to read-only `useMatchDetailQuery` summary for non-active (completed) matches:
   - **Game setup** (game 1 & between games): `BattlefieldPicker` ×2 (Bo3: already-used battlefields disabled with "used G1" tag — soft-enforced), `MulliganSelector` per player (Kept / 1 / 2 set aside), **target-score stepper** (pre-filled from `baseTargetScore(mode)`; bump +1 per win-target battlefield modifier — they stack), `side_notes` input (games 2–3), starting-player toggle.
   - **Live**: `ScoreBoard` (two big scores, "first to {target_score}"), `TurnBar` (Turn N · active player · **Next Turn** → `turn_start` event), mirrored two-column `ScorePad` with big tap targets per player: **Conquer / Hold / Effect / Drew Instead**. Conquer/Hold/Drew-Instead pop a 2-option battlefield chooser (Hold offers "Both" → two events); Effect uses `QtyStepper` for points. `wouldViolateOncePerTurn` on Conquer → inline "Already scored this battlefield this turn — record a draw instead?". Reaching `target_score` → "End game?". Below: reverse-chron `EventLog` + **Undo**. Haptics via `expo-haptics`.
   - **Game summary** (Bo3): game result, running match score, Next Game / End Match. **Match summary**: result, per-game breakdown, notes; Done → final flush → tab.
- New components in `tracker/components/match/`: `LegendPicker`, `BattlefieldPicker` (bottom-sheet modal per `ExportMissingModal`, search input, thumbnail rows), `ScoreBoard`, `TurnBar`, `ScorePad`, `EventLog`, `MulliganSelector`, `MatchRow`. NativeWind semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, …), dark mode via tokens.

## Implementation order

0. Download + read both Rules Hub PDFs; update CLAUDE.md data-sources section.
1. `0007_matches.sql`; run in Supabase dashboard SQL editor.
2. `types.ts` additions → 3. `score-engine.ts` → 4. `queries.ts` → 5. `expo-crypto`, `match-store.ts`, `match-sync.ts` → 6. tab screen + layout entries → 7. `match/new.tsx` + pickers → 8. `match/[id].tsx` live phases → 9. read-only detail, delete, stats header.

## Verification

- `cd tracker && npx tsc --noEmit` after each phase (no test suite/linter configured).
- SQL: run 0007 in dashboard; insert via app as authenticated user; confirm RLS blocks a second test account; confirm grants (no `permission denied for table`).
- Manual, web + iOS sim: Bo1 happy path (setup → all 3 score types → draw-instead → undo → end at 8 → history shows correct stored scores); Bo3 battlefield no-reuse graying; kill/relaunch mid-game → AsyncStorage restore; airplane-mode a full game → reconnect → events flush once (check Supabase table editor, no dupes); DB rows carry correct `seq`, `turn_number`, `battlefield_card_id`, `payload.reason`.
- End with a suggested commit message (project convention).

## Audio-feature extension points (reserved, not built)

Unconstrained `event_type` + `payload jsonb` + `actor='system'` let audio-inferred events (`action_inferred`, `misplay_flag`, `transcript_chunk`, …) insert with no schema change; append-only + `occurred_at`/`seq` interleaves them deterministically with manual taps; `score-engine.ts` is the single place to later add legality checks.

## Critical files

- `supabase/migrations/0007_matches.sql` (new; template `supabase/migrations/0001_init.sql` wishlist block)
- `tracker/lib/types.ts`, `tracker/lib/queries.ts`
- `tracker/lib/score-engine.ts`, `tracker/lib/match-store.ts`, `tracker/lib/match-sync.ts` (new; store pattern from `tracker/lib/browser-store.ts`)
- `tracker/app/(tabs)/_layout.tsx`, `tracker/app/(tabs)/scores.tsx` (new), `tracker/app/match/new.tsx` (new), `tracker/app/match/[id].tsx` (new), `tracker/components/match/*` (new)
- Root `CLAUDE.md` (data-sources section)

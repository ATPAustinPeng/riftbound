# Riftbound Tracker

Cross-platform (iOS + web) collection tracker for Riftbound TCG. Browse ~952 reference cards, track owned copies and playset progress, manage a wishlist, and view collection stats — all backed by Supabase (Postgres + Auth).

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Expo CLI](https://docs.expo.dev/) (via `npx expo`)
- A [Supabase](https://supabase.com/) project (free tier works)
- For iOS: Xcode Simulator or a physical device with Expo Go

## 1. Supabase project setup

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** and run the migrations in order:
   - `supabase/migrations/0001_init.sql` — reference tables, user tables, RLS, profile trigger, and **Postgres role grants**
   - `supabase/migrations/0002_stats.sql` — collection stats RPCs and set totals view
   - `supabase/migrations/0003_foil.sql` — foil owned column and combined playset stats
   - `supabase/migrations/0004_collection_goal.sql` — per-user collection goal on `profiles`
   - `supabase/migrations/0005_games.sql` — match/game tracking tables, scoring view, RLS, and claim RPC
3. Enable **Email** auth under **Authentication → Providers** (enabled by default).
4. Copy your project credentials from **Project Settings → API**:
   - **Project URL**
   - **anon public** key (for the app)
   - **service_role** key (for seeding only — never ship this in the client)

> **Why the migration includes GRANT statements:** Supabase's PostgREST requires both RLS policies *and* explicit Postgres-level `GRANT` statements. RLS alone is not enough — without the grants, the `anon`/`authenticated` roles get `permission denied for table …` even when the RLS policy would allow the row. `0001_init.sql` handles all of this, but if you ever create tables manually you'll need to add grants yourself.

## 2. Seed reference card data

From the repo root:

```bash
cd supabase/seed
npm install
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
npm run seed
```

The seed script reads `data/cards.json` and upserts into `sets`, `cards`, `card_domains`, and `card_tags`. It is safe to re-run after re-scraping.

Required env vars for seeding:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |

## 3. App environment

```bash
cd tracker
```

Edit `.env.local`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

These are the **anon** credentials only. Never put the service role key in the Expo app.

## 4. Run the app

```bash
cd tracker
npm install
```

### iOS

```bash
npx expo start --ios
```

Opens in the iOS Simulator (or scan the QR code with Expo Go on a device).

### Web

```bash
npx expo start --web
```

Opens in your browser at `http://localhost:8081` (or the port Expo prints).

### General dev server

```bash
npx expo start
```

Press `i` for iOS, `w` for web, or scan the QR code.

## App overview

| Tab | Description |
|-----|-------------|
| **Browse** | FlashList grid of all cards with name search and set/rarity/domain/type filters |
| **Collection** | Owned cards grouped by set with quantity steppers, goal-aware stats, and a quick goal selector |
| **Needs** | Cards you still need for your collection goal, with list progress toward that goal |
| **Wishlist** | Want-list with one-tap remove or mark-owned |
| **Games** | Match history, live 1v1 score recorder, timeline replay, and share/claim links |
| **Profile** | Collection goal picker (synced across devices), display name, and sign out |

**Sorting:** Browse cards can be sorted three ways:

- **Set** (default): grouped by set, then collector number
- **Color**: by domain color (Fury → Body → Order → Calm → Mind → Chaos), monocolor before multicolor within each color group, then by set, then collector number
- **Name**: alphabetical by card name

Tap any card to open its detail screen: full image, stats, owned/for-sale steppers, goal progress, wishlist toggle, and notes.

**Collection goal:** Choose how many copies count as "complete" for each card. Five options:

| Goal | Complete when |
|------|----------------|
| **1 each** (`single_separate`) | 1 normal + 1 foil (foil only for commons/uncommons) |
| **3 each** (`playset_separate`) | 3 normal + 3 foil (default; classic playset tracking) |
| **Playset (normal only)** (`playset_normal`) | 3 normal copies; foil ignored |
| **1 total** (`single_combined`) | 1 copy, normal + foil combined |
| **3 total** (`playset_combined`) | 3 copies, normal + foil combined |

The goal is stored on your Supabase `profiles` row and drives the Needs tab, list progress bars, card detail progress, and the Collection stats "complete" count. Foil requirements only apply to commons and uncommons in separate mode; higher rarities ignore the foil track there.

**Foil tracking:** Common and uncommon cards support separate normal and foil owned counts (`quantity_owned_foil` on `user_cards`). Use the ✦ toggle on browse quick-add tiles or the "Owned (foil)" stepper on the detail screen. In combined goal mode, normal and foil copies count together toward the target; `for_sale_count` remains a single number per card.

## Project structure

```
tracker/
  app/                  # expo-router screens
  components/           # CardGrid, FilterBar, QtyStepper, etc.
  lib/
    supabase.ts         # Supabase client
    auth-context.tsx    # Session + profile
    queries.ts          # TanStack Query hooks
    types.ts            # DB row types
supabase/
  migrations/           # SQL schema + stats RPCs
  seed/seed.ts          # Card data seeder
```

## Typecheck

```bash
cd tracker && npx tsc --noEmit
```

## Troubleshooting

- **Blank browse grid / "Could not load cards"** — Run the seed script and confirm rows exist in the `cards` table via the Supabase Table Editor.
- **`permission denied for table …`** — The Postgres role grants are missing. Re-run `0001_init.sql` in full, or run this manually in the SQL Editor:
  ```sql
  grant select on public.sets         to anon, authenticated;
  grant select on public.cards        to anon, authenticated;
  grant select on public.card_domains to anon, authenticated;
  grant select on public.card_tags    to anon, authenticated;
  grant select, insert, update, delete on public.profiles   to authenticated;
  grant select, insert, update, delete on public.user_cards to authenticated;
  grant select, insert, update, delete on public.wishlist   to authenticated;
  grant select, insert, update, delete on public.matches          to authenticated;
  grant select, insert, update, delete on public.match_players    to authenticated;
  grant select, insert, update, delete on public.games            to authenticated;
  grant select, insert, update, delete on public.game_battlefields to authenticated;
  grant select, insert, update, delete on public.game_events       to authenticated;
  grant select on public.scoring_events                              to authenticated;
  grant all on public.sets         to service_role;
  grant all on public.cards        to service_role;
  grant all on public.card_domains to service_role;
  grant all on public.card_tags    to service_role;
  grant all on public.profiles     to service_role;
  grant all on public.user_cards   to service_role;
  grant all on public.wishlist     to service_role;
  grant all on public.matches          to service_role;
  grant all on public.match_players    to service_role;
  grant all on public.games            to service_role;
  grant all on public.game_battlefields to service_role;
  grant all on public.game_events      to service_role;
  grant all on public.scoring_events   to service_role;
  ```
- **Game tracker errors** — Ensure `0005_games.sql` was applied (tables, RLS policies, grants, and `claim_match_player` RPC). Re-run the grant block above if you see `permission denied` on match tables.
- **Auth errors** — Check `.env.local` values match your Supabase project. Use the **anon** key (not service_role) for `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- **Stats show zeros** — Ensure `0002_stats.sql` was applied; the app falls back to client-side computation if RPCs are missing. After adding foil tracking, also run `0003_foil.sql`. Run `0004_collection_goal.sql` so the Profile goal picker can persist to the database.
- **"Failed to fetch profile"** — Usually the `profiles` grant is missing; see the permission denied fix above.
- **`npm install` on a corporate machine** — The project `.npmrc` intentionally does not pin a registry, so your machine's `~/.npmrc` registry is used. Set registry=https://registry.npmjs.org` to set it to the default npm registry. If that doesn't work, try setting the env var `NPM_CONFIG_REGISTRY=https://registry.npmjs.org npm install`

## Verifying data is saved to the database

**Option 1 — Supabase SQL Editor**
Go to your project dashboard → **SQL Editor** and run:
```sql
select * from user_cards order by updated_at desc limit 20;
```
You'll see rows with `quantity_owned`, `quantity_owned_foil`, `for_sale_count`, etc.

**Option 2 — Table Editor**
In the Supabase dashboard go to **Table Editor → user_cards** to browse rows visually without SQL.

**Option 3 — Collection tab**
The Collection tab only shows cards where you own at least one copy. If a card appears there, it's confirmed saved in the database.

**Option 4 — Hard-refresh test**
Add a card on the Browse screen, then hard-refresh the page (Cmd+Shift+R / Ctrl+Shift+R). If the count persists after a full reload, it's hitting the database.

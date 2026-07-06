# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

Riftbound TCG collection tracker, in three connected parts:

1. **Scraper** (repo root, Python): `scraper.py` pulls ~952 cards from Riot's public publishing-content API and writes `data/cards_raw.json`, `data/cards.json` (normalized), and a local SQLite DB. `main.py` is PyCharm boilerplate — ignore it.
2. **Supabase** (`supabase/`): SQL migrations defining the Postgres schema (reference card tables + per-user `profiles`/`user_cards`/`wishlist` with RLS), and a seed script (`supabase/seed/seed.ts`) that upserts `data/cards.json` into Supabase.
3. **Tracker app** (`tracker/`): Expo (React Native, iOS + web) app using expo-router, TanStack Query, NativeWind, and Supabase Auth/Postgres. Has its own `tracker/CLAUDE.md` (Expo v56 — consult https://docs.expo.dev/versions/v56.0.0/ before writing Expo code).

Data flows one way: `scraper.py` → `data/cards.json` → seed script (service-role key) → Supabase → app (anon key). Re-running scraper and seed is idempotent (upserts by card `id`).

## Commands

### Scraper (repo root)

```bash
pip install -r requirements.txt
python scraper.py --out-dir data              # scrape cards
python scraper.py --out-dir data --download-images  # also fetch card images (slow)
```

### Seed Supabase (after scraping)

```bash
cd supabase/seed && npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
```

### Tracker app

```bash
cd tracker
npm install              # postinstall runs patch-package (FlashList patch in tracker/patches/)
npx expo start --ios     # iOS simulator
npx expo start --web     # web at localhost:8081
npx tsc --noEmit         # typecheck (no test suite or linter configured)
```

App env lives in `tracker/.env.local` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Never put the service-role key in the app.

If `npm install` hits a corporate registry / 403, `tracker/.npmrc` pins registry.npmjs.org; override a stubborn env var with `NPM_CONFIG_REGISTRY=https://registry.npmjs.org npm install`.

## Supabase migrations

- Migrations in `supabase/migrations/` are applied manually, in numeric order, via the Supabase dashboard SQL Editor (no Supabase CLI setup).
- **RLS alone is not enough.** PostgREST also requires Postgres-level `GRANT` statements for `anon`/`authenticated`/`service_role`. A new table without grants fails with `permission denied for table …` even when RLS would allow the row. See `0001_init.sql` for the pattern; any new table in a migration must include both policies and grants.

## Tracker architecture

- `tracker/app/` — expo-router file-based routes: `(auth)/` (sign in/up), `(tabs)/` (Browse, Collection, Needs, Wishlist, Profile), `card/` (card detail).
- `tracker/lib/` — the shared core:
  - `supabase.ts` — client setup
  - `auth-context.tsx` — session + profile provider
  - `queries.ts` — all TanStack Query hooks (reads and mutations); DB access goes through here, not ad-hoc in components
  - `types.ts` — DB row types
- `tracker/components/` — CardGrid, FilterBar, QtyStepper, etc. Styling is NativeWind (Tailwind classes).

### Collection-goal domain logic

The core business rules live around the user's collection goal (stored on `profiles`, five modes: `single_separate`, `playset_separate` (default), `playset_normal`, `single_combined`, `playset_combined`). Playset target varies by card type: Battlefield/Legend = 1, Rune = 12, Token = untracked, everything else = 3. Foil copies (`quantity_owned_foil` on `user_cards`) are only tracked for commons/uncommons, and only required by `*_separate` modes. This logic drives the Needs tab, progress bars, and stats RPCs (`supabase/migrations/0002_stats.sql`, `0003_foil.sql`, `0006_playset_foil_goal.sql`) — keep the SQL RPCs and the client-side fallback in `queries.ts` in sync when changing it. Full tables in `tracker/README.md`.

## Workflow

- Whenever you change files, end your response with a suggested commit message, even if you don't run `git commit` yourself.

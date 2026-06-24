-- Persist per-user collection goal (Needs filter, progress bars, stats).
alter table public.profiles
  add column collection_goal text not null default 'playset_separate'
  check (
    collection_goal in (
      'single_separate',
      'playset_separate',
      'playset_normal',
      'single_combined',
      'playset_combined'
    )
  );

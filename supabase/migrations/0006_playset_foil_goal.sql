-- Allow the playset_foil collection goal.
alter table public.profiles
  drop constraint if exists profiles_collection_goal_check;

alter table public.profiles
  add constraint profiles_collection_goal_check
  check (
    collection_goal in (
      'single_separate',
      'playset_separate',
      'playset_normal',
      'playset_foil',
      'single_combined',
      'playset_combined'
    )
  );

-- Replace the six collection goals with master / playset_nonfoil / playset_all.
alter table public.profiles
  drop constraint if exists profiles_collection_goal_check;

update public.profiles
set collection_goal = case collection_goal
  when 'single_separate' then 'master'
  when 'single_combined' then 'master'
  when 'playset_separate' then 'playset_all'
  when 'playset_foil' then 'playset_all'
  when 'playset_normal' then 'playset_nonfoil'
  when 'playset_combined' then 'playset_nonfoil'
  else collection_goal
end
where collection_goal in (
  'single_separate',
  'single_combined',
  'playset_separate',
  'playset_foil',
  'playset_normal',
  'playset_combined'
);

alter table public.profiles
  alter column collection_goal set default 'playset_all';

alter table public.profiles
  add constraint profiles_collection_goal_check
  check (collection_goal in ('master', 'playset_nonfoil', 'playset_all'));

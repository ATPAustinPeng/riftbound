-- Riftbound Tracker: reference + user tables, RLS, profile-on-signup trigger

-- ---------------------------------------------------------------------------
-- Reference tables (public read via RLS)
-- ---------------------------------------------------------------------------

create table public.sets (
  id text primary key,
  label text not null,
  max_collector_number integer
);

create table public.cards (
  id text primary key,
  collector_number integer,
  name text not null,
  set_id text not null references public.sets (id),
  set_name text,
  public_code text,
  card_type text,
  super_type text,
  rarity_id text,
  rarity_label text,
  energy integer,
  might integer,
  power integer,
  might_bonus integer,
  orientation text,
  illustrator text,
  ability_html text,
  ability_text text,
  image_url text,
  image_alt text,
  image_width integer,
  image_height integer
);

create table public.card_domains (
  card_id text not null references public.cards (id) on delete cascade,
  domain_id text not null,
  domain_label text,
  primary key (card_id, domain_id)
);

create table public.card_tags (
  card_id text not null references public.cards (id) on delete cascade,
  tag text not null,
  primary key (card_id, tag)
);

create index cards_set_id_idx on public.cards (set_id);
create index cards_rarity_id_idx on public.cards (rarity_id);
create index cards_name_idx on public.cards (name);
create index card_domains_card_id_idx on public.card_domains (card_id);
create index card_tags_card_id_idx on public.card_tags (card_id);

alter table public.sets enable row level security;
alter table public.cards enable row level security;
alter table public.card_domains enable row level security;
alter table public.card_tags enable row level security;

create policy "public read" on public.sets
  for select using (true);

create policy "public read" on public.cards
  for select using (true);

create policy "public read" on public.card_domains
  for select using (true);

create policy "public read" on public.card_tags
  for select using (true);

-- PostgREST needs explicit Postgres-level grants in addition to RLS policies.
-- Without these the anon/authenticated roles get "permission denied" even if
-- the RLS policy would allow the row.
grant select on public.sets          to anon, authenticated;
grant select on public.cards         to anon, authenticated;
grant select on public.card_domains  to anon, authenticated;
grant select on public.card_tags     to anon, authenticated;

-- ---------------------------------------------------------------------------
-- User tables (RLS: own rows only)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.user_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null references public.cards (id) on delete cascade,
  quantity_owned integer not null default 0,
  for_sale_count integer not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table public.wishlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null references public.cards (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index user_cards_user_id_idx on public.user_cards (user_id);
create index user_cards_card_id_idx on public.user_cards (card_id);
create index wishlist_user_id_idx on public.wishlist (user_id);

alter table public.profiles enable row level security;
alter table public.user_cards enable row level security;
alter table public.wishlist enable row level security;

create policy "own rows" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own rows" on public.user_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.wishlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.profiles   to authenticated;
grant select, insert, update, delete on public.user_cards to authenticated;
grant select, insert, update, delete on public.wishlist   to authenticated;

-- service_role needs write access to reference tables for the seed script
grant all on public.sets         to service_role;
grant all on public.cards        to service_role;
grant all on public.card_domains to service_role;
grant all on public.card_tags    to service_role;
grant all on public.profiles     to service_role;
grant all on public.user_cards   to service_role;
grant all on public.wishlist     to service_role;

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

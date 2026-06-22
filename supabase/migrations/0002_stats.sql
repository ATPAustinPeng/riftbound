-- Collection stats helpers: reference set totals + per-user aggregate RPCs

create or replace view public.set_card_totals as
select
  c.set_id,
  s.label as set_label,
  count(*)::integer as total_count
from public.cards c
join public.sets s on s.id = c.set_id
group by c.set_id, s.label;

alter view public.set_card_totals set (security_invoker = true);

grant select on public.set_card_totals to anon, authenticated;

create or replace function public.get_my_collection_summary()
returns table (
  unique_owned bigint,
  complete_playsets bigint,
  total_for_sale bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*) filter (where quantity_owned > 0),
    count(*) filter (where quantity_owned >= 3),
    coalesce(sum(for_sale_count) filter (where for_sale_count > 0), 0)::bigint
  from public.user_cards
  where user_id = auth.uid();
$$;

grant execute on function public.get_my_collection_summary() to authenticated;

create or replace function public.get_my_set_completion()
returns table (
  set_id text,
  set_label text,
  owned_count bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    sct.set_id,
    sct.set_label,
    coalesce(owned.owned_count, 0)::bigint as owned_count,
    sct.total_count::bigint as total_count
  from public.set_card_totals sct
  left join (
    select c.set_id, count(distinct uc.card_id)::integer as owned_count
    from public.user_cards uc
    join public.cards c on c.id = uc.card_id
    where uc.user_id = auth.uid()
      and uc.quantity_owned > 0
    group by c.set_id
  ) owned on owned.set_id = sct.set_id
  order by sct.set_label;
$$;

grant execute on function public.get_my_set_completion() to authenticated;

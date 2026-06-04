alter table public.isins
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by text;

create index if not exists isins_deleted_at_idx
  on public.isins (deleted_at desc)
  where deleted_at is not null;

create table if not exists public.user_settings (
  identity_email text primary key,
  theme_preference text not null default 'device',
  timezone text not null default 'Europe/Rome',
  dashboard_refresh_seconds integer not null default 15,
  chart_display text not null default 'area',
  updated_at timestamptz not null default now(),
  constraint user_settings_theme_preference check (theme_preference in ('light', 'dark', 'device')),
  constraint user_settings_dashboard_refresh_seconds check (dashboard_refresh_seconds >= 4 and dashboard_refresh_seconds <= 300)
);

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  level text not null default 'info',
  message text not null,
  entity_type text,
  entity_id text,
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_events_source check (source in ('user', 'worker')),
  constraint app_events_level check (level in ('info', 'success', 'warning', 'error'))
);

create index if not exists app_events_created_at_idx
  on public.app_events (created_at desc);

create index if not exists app_events_source_created_at_idx
  on public.app_events (source, created_at desc);

create or replace function public.list_deleted_isins(
  search_query text default null,
  page_size integer default 50,
  page_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rows jsonb;
  total_count integer;
begin
  with filtered as (
    select
      isin,
      bond_name,
      active,
      source_row,
      created_at,
      updated_at,
      deleted_at,
      deleted_by,
      restored_at,
      restored_by
    from public.isins
    where not active
      and deleted_at is not null
      and (
        search_query is null
        or search_query = ''
        or isin ilike '%' || search_query || '%'
        or bond_name ilike '%' || search_query || '%'
      )
  ),
  counted as (
    select count(*)::integer as count from filtered
  ),
  paged as (
    select *
    from filtered
    order by deleted_at desc, isin asc
    limit page_size
    offset page_offset
  )
  select
    coalesce((select jsonb_agg(to_jsonb(paged)) from paged), '[]'::jsonb),
    (select count from counted)
  into rows, total_count;

  return jsonb_build_object('rows', rows, 'total', total_count);
end;
$$;

create or replace function public.list_app_events(
  source_filter text default null,
  page_size integer default 80,
  page_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rows jsonb;
  total_count integer;
begin
  with filtered as (
    select *
    from public.app_events
    where source_filter is null
      or source_filter = 'all'
      or source = source_filter
  ),
  counted as (
    select count(*)::integer as count from filtered
  ),
  paged as (
    select *
    from filtered
    order by created_at desc
    limit page_size
    offset page_offset
  )
  select
    coalesce((select jsonb_agg(to_jsonb(paged)) from paged), '[]'::jsonb),
    (select count from counted)
  into rows, total_count;

  return jsonb_build_object('rows', rows, 'total', total_count);
end;
$$;

create or replace function public.record_app_event(
  event_source text,
  event_level text,
  event_message text,
  event_entity_type text default null,
  event_entity_id text default null,
  event_actor_email text default null,
  event_metadata jsonb default '{}'::jsonb
)
returns public.app_events
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.app_events;
begin
  insert into public.app_events (
    source,
    level,
    message,
    entity_type,
    entity_id,
    actor_email,
    metadata
  )
  values (
    event_source,
    event_level,
    event_message,
    event_entity_type,
    event_entity_id,
    event_actor_email,
    coalesce(event_metadata, '{}'::jsonb)
  )
  returning * into inserted;

  return inserted;
end;
$$;

alter table public.user_settings enable row level security;
alter table public.app_events enable row level security;

grant select, insert, update, delete on public.user_settings to service_role;
grant select, insert, update, delete on public.app_events to service_role;
grant execute on function public.list_deleted_isins(text, integer, integer) to service_role;
grant execute on function public.list_app_events(text, integer, integer) to service_role;
grant execute on function public.record_app_event(text, text, text, text, text, text, jsonb) to service_role;

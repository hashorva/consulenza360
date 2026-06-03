create extension if not exists pgcrypto;

do $$ begin
  create type public.check_status as enum ('present', 'absent', 'error');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.run_status as enum ('pending', 'processing', 'completed', 'failed', 'blocked');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.run_item_status as enum ('pending', 'processing', 'completed', 'error');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.run_trigger_type as enum ('cron', 'manual');
exception when duplicate_object then null;
end $$;

create table if not exists public.isins (
  isin varchar(12) primary key,
  bond_name text not null,
  source_row integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint isins_valid_isin check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$')
);

create table if not exists public.settings (
  id boolean primary key default true,
  enabled boolean not null default true,
  timezone text not null default 'Europe/Rome',
  run_hour integer not null default 10,
  weekday_only boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id),
  constraint settings_valid_run_hour check (run_hour >= 0 and run_hour <= 23)
);

insert into public.settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.check_runs (
  id uuid primary key default gen_random_uuid(),
  status public.run_status not null default 'pending',
  trigger_type public.run_trigger_type not null,
  scheduled_date date not null,
  timezone text not null default 'Europe/Rome',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_isins integer not null default 0,
  processed_isins integer not null default 0,
  present_count integer not null default 0,
  absent_count integer not null default 0,
  error_count integer not null default 0,
  blocked_reason text,
  blocked_metadata jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists check_runs_one_cron_per_day
  on public.check_runs (scheduled_date)
  where trigger_type = 'cron';

create index if not exists check_runs_latest_idx
  on public.check_runs (created_at desc);

create table if not exists public.check_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.check_runs(id) on delete cascade,
  isin varchar(12) not null references public.isins(isin),
  status public.run_item_status not null default 'pending',
  attempts integer not null default 0,
  claimed_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (run_id, isin)
);

create index if not exists check_run_items_claim_idx
  on public.check_run_items (run_id, status, created_at);

create index if not exists check_run_items_processing_idx
  on public.check_run_items (run_id, claimed_at)
  where status = 'processing';

create table if not exists public.isin_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.check_runs(id) on delete cascade,
  isin varchar(12) not null references public.isins(isin),
  status public.check_status not null,
  parsed_fields jsonb not null default '{}'::jsonb,
  source_url text,
  response_time integer,
  error_message text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (run_id, isin)
);

create index if not exists isin_checks_run_idx
  on public.isin_checks (run_id, checked_at desc);

create index if not exists isin_checks_isin_idx
  on public.isin_checks (isin, checked_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists isins_set_updated_at on public.isins;
create trigger isins_set_updated_at
before update on public.isins
for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

create or replace function public.import_isins(rows jsonb)
returns table (imported_count integer, active_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.isins (isin, bond_name, source_row, active)
  select
    upper(trim(elem->>'isin'))::varchar(12),
    coalesce(nullif(trim(elem->>'bond_name'), ''), upper(trim(elem->>'isin'))),
    nullif(elem->>'source_row', '')::integer,
    true
  from jsonb_array_elements(rows) as elem
  where upper(trim(elem->>'isin')) ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'
  on conflict (isin) do update
  set
    bond_name = excluded.bond_name,
    source_row = excluded.source_row,
    active = true,
    updated_at = now();

  return query
  select
    jsonb_array_length(rows)::integer,
    (select count(*)::integer from public.isins where active);
end;
$$;

create or replace function public.create_run(target_trigger public.run_trigger_type, target_date date, target_timezone text)
returns table (run_id uuid, total_isins integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_run_id uuid;
  active_count integer;
begin
  select count(*)::integer into active_count
  from public.isins
  where active;

  insert into public.check_runs (
    status,
    trigger_type,
    scheduled_date,
    timezone,
    total_isins
  )
  values (
    'processing',
    target_trigger,
    target_date,
    target_timezone,
    active_count
  )
  returning id into new_run_id;

  insert into public.check_run_items (run_id, isin)
  select new_run_id, i.isin
  from public.isins i
  where i.active
  order by i.isin;

  return query select new_run_id, active_count;
end;
$$;

create or replace function public.maybe_start_due_run(now_utc timestamptz)
returns table (should_enqueue boolean, run_id uuid, total_isins integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.settings%rowtype;
  local_ts timestamp;
  local_date date;
  local_hour integer;
  local_dow integer;
  created_run record;
begin
  select * into cfg from public.settings where id = true;
  if cfg.id is null or cfg.enabled is false then
    return query select false, null::uuid, 0;
    return;
  end if;

  local_ts := now_utc at time zone cfg.timezone;
  local_date := local_ts::date;
  local_hour := extract(hour from local_ts)::integer;
  local_dow := extract(isodow from local_ts)::integer;

  if cfg.weekday_only and local_dow not between 1 and 5 then
    return query select false, null::uuid, 0;
    return;
  end if;

  if local_hour <> cfg.run_hour then
    return query select false, null::uuid, 0;
    return;
  end if;

  if exists (
    select 1
    from public.check_runs
    where trigger_type = 'cron'
      and scheduled_date = local_date
  ) then
    return query select false, null::uuid, 0;
    return;
  end if;

  select * into created_run
  from public.create_run('cron', local_date, cfg.timezone);

  return query select true, created_run.run_id, created_run.total_isins;
end;
$$;

create or replace function public.start_manual_run(now_utc timestamptz)
returns table (run_id uuid, total_isins integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.settings%rowtype;
  local_ts timestamp;
  created_run record;
begin
  select * into cfg from public.settings where id = true;
  local_ts := now_utc at time zone coalesce(cfg.timezone, 'Europe/Rome');

  select * into created_run
  from public.create_run('manual', local_ts::date, coalesce(cfg.timezone, 'Europe/Rome'));

  return query select created_run.run_id, created_run.total_isins;
end;
$$;

create or replace function public.claim_check_chunk(target_run_id uuid, chunk_size integer)
returns table (isin varchar, bond_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.check_run_items
  set
    status = 'pending',
    claimed_at = null,
    error_message = 'Reclaimed after stale processing lease.'
  where run_id = target_run_id
    and status = 'processing'
    and claimed_at < now() - interval '10 minutes';

  return query
  with target_items as (
    select cri.id
    from public.check_run_items cri
    where cri.run_id = target_run_id
      and cri.status = 'pending'
    order by cri.created_at, cri.isin
    limit chunk_size
    for update skip locked
  )
  update public.check_run_items cri
  set
    status = 'processing',
    claimed_at = now(),
    attempts = cri.attempts + 1,
    error_message = null
  from target_items
  cross join public.isins i
  where cri.id = target_items.id
    and i.isin = cri.isin
  returning cri.isin, i.bond_name;
end;
$$;

create or replace function public.complete_check_chunk(target_run_id uuid, results jsonb)
returns table (has_more_work boolean, run_status public.run_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status public.run_status;
begin
  insert into public.isin_checks (
    run_id,
    isin,
    status,
    parsed_fields,
    source_url,
    response_time,
    error_message,
    checked_at
  )
  select
    target_run_id,
    upper(elem->>'isin')::varchar(12),
    (elem->>'status')::public.check_status,
    coalesce(elem->'parsed_fields', '{}'::jsonb),
    elem->>'source_url',
    nullif(elem->>'response_time', '')::integer,
    elem->>'error_message',
    coalesce(nullif(elem->>'checked_at', '')::timestamptz, now())
  from jsonb_array_elements(results) as elem
  on conflict (run_id, isin) do update
  set
    status = excluded.status,
    parsed_fields = excluded.parsed_fields,
    source_url = excluded.source_url,
    response_time = excluded.response_time,
    error_message = excluded.error_message,
    checked_at = excluded.checked_at;

  update public.check_run_items cri
  set
    status = 'completed',
    completed_at = now(),
    error_message = elem->>'error_message'
  from jsonb_array_elements(results) as elem
  where cri.run_id = target_run_id
    and cri.isin = upper(elem->>'isin')::varchar(12);

  select
    case
      when exists (
        select 1 from public.check_run_items
        where run_id = target_run_id and status in ('pending', 'processing')
      )
      then 'processing'::public.run_status
      else 'completed'::public.run_status
    end
  into next_status;

  update public.check_runs cr
  set
    status = next_status,
    completed_at = case when next_status = 'completed' then now() else cr.completed_at end,
    processed_isins = coalesce(counts.processed_count, 0),
    present_count = coalesce(counts.present_count, 0),
    absent_count = coalesce(counts.absent_count, 0),
    error_count = coalesce(counts.error_count, 0)
  from (
    select
      count(*) filter (where ic.status in ('present', 'absent', 'error'))::integer as processed_count,
      count(*) filter (where ic.status = 'present')::integer as present_count,
      count(*) filter (where ic.status = 'absent')::integer as absent_count,
      count(*) filter (where ic.status = 'error')::integer as error_count
    from public.isin_checks ic
    where ic.run_id = target_run_id
  ) counts
  where cr.id = target_run_id;

  return query
  select next_status = 'processing', next_status;
end;
$$;

create or replace function public.mark_run_blocked(target_run_id uuid, reason text, metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.check_run_items
  set
    status = 'error',
    completed_at = now(),
    error_message = reason
  where run_id = target_run_id
    and status in ('pending', 'processing');

  update public.check_runs
  set
    status = 'blocked',
    completed_at = now(),
    blocked_reason = reason,
    blocked_metadata = metadata,
    processed_isins = (
      select count(*)::integer
      from public.isin_checks
      where run_id = target_run_id
    ),
    error_count = (
      select count(*)::integer
      from public.isin_checks
      where run_id = target_run_id and status = 'error'
    )
  where id = target_run_id;
end;
$$;

create or replace function public.get_dashboard_summary()
returns jsonb
language sql
security definer
set search_path = public
as $$
with latest_run as (
  select *
  from public.check_runs
  order by created_at desc
  limit 1
),
history as (
  select
    cr.scheduled_date,
    cr.present_count,
    cr.absent_count,
    cr.error_count
  from public.check_runs cr
  where cr.status in ('completed', 'blocked', 'failed', 'processing')
  order by cr.scheduled_date desc, cr.created_at desc
  limit 30
),
active_counts as (
  select
    count(*)::integer as total_active
  from public.isins
  where active
)
select jsonb_build_object(
  'active_isins', (select total_active from active_counts),
  'latest_run', coalesce((select to_jsonb(lr) from latest_run lr), 'null'::jsonb),
  'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.scheduled_date) from history h), '[]'::jsonb)
);
$$;

create or replace function public.list_isins(
  search_query text default null,
  status_filter text default null,
  sort_key text default 'isin',
  sort_dir text default 'asc',
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
  with latest_per_isin as (
    select distinct on (ic.isin)
      ic.isin,
      ic.status,
      ic.checked_at,
      ic.response_time,
      ic.error_message,
      ic.source_url
    from public.isin_checks ic
    order by ic.isin, ic.checked_at desc
  ),
  filtered as (
    select
      i.isin,
      i.bond_name,
      i.active,
      i.created_at,
      i.updated_at,
      l.status,
      l.checked_at,
      l.response_time,
      l.error_message,
      l.source_url
    from public.isins i
    left join latest_per_isin l on l.isin = i.isin
    where i.active
      and (
        search_query is null
        or search_query = ''
        or i.isin ilike '%' || search_query || '%'
        or i.bond_name ilike '%' || search_query || '%'
      )
      and (
        status_filter is null
        or status_filter = 'all'
        or coalesce(l.status::text, 'unchecked') = status_filter
      )
  ),
  counted as (
    select count(*)::integer as count from filtered
  ),
  paged as (
    select *
    from filtered
    order by
      case when sort_key = 'bond_name' and sort_dir = 'asc' then bond_name end asc,
      case when sort_key = 'bond_name' and sort_dir = 'desc' then bond_name end desc,
      case when sort_key = 'status' and sort_dir = 'asc' then status end asc nulls last,
      case when sort_key = 'status' and sort_dir = 'desc' then status end desc nulls last,
      case when sort_key = 'checked_at' and sort_dir = 'asc' then checked_at end asc nulls last,
      case when sort_key = 'checked_at' and sort_dir = 'desc' then checked_at end desc nulls last,
      case when sort_dir = 'desc' then isin end desc,
      isin asc
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

create or replace function public.get_run_logs(target_run_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
with summary as (
  select
    count(*)::integer as total,
    count(*) filter (where status = 'pending')::integer as pending,
    count(*) filter (where status = 'processing')::integer as processing,
    count(*) filter (where status = 'completed')::integer as completed,
    count(*) filter (where status = 'error')::integer as errored
  from public.check_run_items
  where run_id = target_run_id
),
recent_checks as (
  select
    ic.isin,
    i.bond_name,
    ic.status,
    ic.response_time,
    ic.error_message,
    ic.checked_at
  from public.isin_checks ic
  join public.isins i on i.isin = ic.isin
  where ic.run_id = target_run_id
  order by ic.checked_at desc
  limit 15
),
processing_items as (
  select
    cri.isin,
    i.bond_name,
    cri.claimed_at
  from public.check_run_items cri
  join public.isins i on i.isin = cri.isin
  where cri.run_id = target_run_id
    and cri.status = 'processing'
  order by cri.claimed_at desc nulls last
  limit 15
)
select jsonb_build_object(
  'summary', (select to_jsonb(summary) from summary),
  'recentChecks', coalesce((select jsonb_agg(to_jsonb(recent_checks)) from recent_checks), '[]'::jsonb),
  'processingItems', coalesce((select jsonb_agg(to_jsonb(processing_items)) from processing_items), '[]'::jsonb)
);
$$;

alter table public.isins enable row level security;
alter table public.settings enable row level security;
alter table public.check_runs enable row level security;
alter table public.check_run_items enable row level security;
alter table public.isin_checks enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.isins to service_role;
grant select, insert, update, delete on public.settings to service_role;
grant select, insert, update, delete on public.check_runs to service_role;
grant select, insert, update, delete on public.check_run_items to service_role;
grant select, insert, update, delete on public.isin_checks to service_role;
grant execute on function public.import_isins(jsonb) to service_role;
grant execute on function public.maybe_start_due_run(timestamptz) to service_role;
grant execute on function public.start_manual_run(timestamptz) to service_role;
grant execute on function public.claim_check_chunk(uuid, integer) to service_role;
grant execute on function public.complete_check_chunk(uuid, jsonb) to service_role;
grant execute on function public.mark_run_blocked(uuid, text, jsonb) to service_role;
grant execute on function public.get_dashboard_summary() to service_role;
grant execute on function public.list_isins(text, text, text, text, integer, integer) to service_role;
grant execute on function public.get_run_logs(uuid) to service_role;

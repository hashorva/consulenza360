alter table public.settings
  add column if not exists manual_refresh_cooldown_minutes integer not null default 30,
  add column if not exists manual_refresh_daily_limit integer not null default 8;

do $$
begin
  alter table public.settings
    add constraint settings_manual_refresh_cooldown_minutes
    check (manual_refresh_cooldown_minutes >= 15 and manual_refresh_cooldown_minutes <= 240);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.settings
    add constraint settings_manual_refresh_daily_limit
    check (manual_refresh_daily_limit >= 1 and manual_refresh_daily_limit <= 8);
exception when duplicate_object then null;
end $$;

create or replace function public.get_manual_refresh_policy(now_utc timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.settings%rowtype;
  cfg_timezone text;
  cooldown_minutes integer;
  daily_limit integer;
  local_ts timestamp;
  local_date date;
  manual_count integer;
  active_run_id uuid;
  latest_started_at timestamptz;
  next_allowed_at timestamptz;
  seconds_until_next integer := 0;
  reason text := null;
begin
  select * into cfg
  from public.settings
  where id = true;

  cfg_timezone := coalesce(cfg.timezone, 'Europe/Rome');
  cooldown_minutes := coalesce(cfg.manual_refresh_cooldown_minutes, 30);
  daily_limit := coalesce(cfg.manual_refresh_daily_limit, 8);
  local_ts := now_utc at time zone cfg_timezone;
  local_date := local_ts::date;

  select count(*)::integer into manual_count
  from public.check_runs
  where trigger_type = 'manual'
    and (started_at at time zone cfg_timezone)::date = local_date;

  select id into active_run_id
  from public.check_runs
  where status in ('pending', 'processing')
  order by created_at desc
  limit 1;

  select max(started_at) into latest_started_at
  from public.check_runs;

  if active_run_id is not null then
    reason := 'active_run';
  elsif manual_count >= daily_limit then
    reason := 'daily_limit';
    next_allowed_at := ((local_date + 1)::timestamp at time zone cfg_timezone);
  elsif latest_started_at is not null and now_utc < latest_started_at + make_interval(mins => cooldown_minutes) then
    reason := 'cooldown';
    next_allowed_at := latest_started_at + make_interval(mins => cooldown_minutes);
  end if;

  if next_allowed_at is not null then
    seconds_until_next := greatest(ceil(extract(epoch from (next_allowed_at - now_utc)))::integer, 0);
  end if;

  return jsonb_build_object(
    'can_refresh', reason is null,
    'reason', reason,
    'remaining_today', greatest(daily_limit - manual_count, 0),
    'manual_refresh_limit', daily_limit,
    'manual_refresh_cooldown_minutes', cooldown_minutes,
    'next_allowed_at', case when next_allowed_at is null then null else to_jsonb(next_allowed_at) end,
    'seconds_until_next', seconds_until_next
  );
end;
$$;

create or replace function public.start_guarded_manual_run(now_utc timestamptz)
returns table (
  allowed boolean,
  reason text,
  run_id uuid,
  total_isins integer,
  remaining_today integer,
  next_allowed_at timestamptz,
  seconds_until_next integer,
  manual_refresh_limit integer,
  manual_refresh_cooldown_minutes integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.settings%rowtype;
  cfg_timezone text;
  cooldown_minutes integer;
  daily_limit integer;
  local_ts timestamp;
  local_date date;
  manual_count integer;
  active_run_id uuid;
  latest_started_at timestamptz;
  calculated_next_allowed_at timestamptz;
  calculated_seconds_until_next integer := 0;
  created_run record;
begin
  perform pg_advisory_xact_lock(hashtext('consulenza360:start_manual_run'));

  select * into cfg
  from public.settings
  where id = true
  for update;

  cfg_timezone := coalesce(cfg.timezone, 'Europe/Rome');
  cooldown_minutes := coalesce(cfg.manual_refresh_cooldown_minutes, 30);
  daily_limit := coalesce(cfg.manual_refresh_daily_limit, 8);
  local_ts := now_utc at time zone cfg_timezone;
  local_date := local_ts::date;

  select count(*)::integer into manual_count
  from public.check_runs
  where trigger_type = 'manual'
    and (started_at at time zone cfg_timezone)::date = local_date;

  select id into active_run_id
  from public.check_runs
  where status in ('pending', 'processing')
  order by created_at desc
  limit 1;

  if active_run_id is not null then
    return query
    select
      false,
      'active_run'::text,
      null::uuid,
      0,
      greatest(daily_limit - manual_count, 0),
      null::timestamptz,
      0,
      daily_limit,
      cooldown_minutes;
    return;
  end if;

  if manual_count >= daily_limit then
    calculated_next_allowed_at := ((local_date + 1)::timestamp at time zone cfg_timezone);
    calculated_seconds_until_next := greatest(ceil(extract(epoch from (calculated_next_allowed_at - now_utc)))::integer, 0);
    return query
    select
      false,
      'daily_limit'::text,
      null::uuid,
      0,
      0,
      calculated_next_allowed_at,
      calculated_seconds_until_next,
      daily_limit,
      cooldown_minutes;
    return;
  end if;

  select max(started_at) into latest_started_at
  from public.check_runs;

  if latest_started_at is not null and now_utc < latest_started_at + make_interval(mins => cooldown_minutes) then
    calculated_next_allowed_at := latest_started_at + make_interval(mins => cooldown_minutes);
    calculated_seconds_until_next := greatest(ceil(extract(epoch from (calculated_next_allowed_at - now_utc)))::integer, 0);
    return query
    select
      false,
      'cooldown'::text,
      null::uuid,
      0,
      greatest(daily_limit - manual_count, 0),
      calculated_next_allowed_at,
      calculated_seconds_until_next,
      daily_limit,
      cooldown_minutes;
    return;
  end if;

  select * into created_run
  from public.create_run('manual', local_date, cfg_timezone);

  calculated_next_allowed_at := now_utc + make_interval(mins => cooldown_minutes);
  calculated_seconds_until_next := cooldown_minutes * 60;

  return query
  select
    true,
    null::text,
    created_run.run_id,
    created_run.total_isins,
    greatest(daily_limit - manual_count - 1, 0),
    calculated_next_allowed_at,
    calculated_seconds_until_next,
    daily_limit,
    cooldown_minutes;
end;
$$;

drop function if exists public.start_manual_run(timestamptz);

create function public.start_manual_run(now_utc timestamptz)
returns table (
  allowed boolean,
  reason text,
  run_id uuid,
  total_isins integer,
  remaining_today integer,
  next_allowed_at timestamptz,
  seconds_until_next integer,
  manual_refresh_limit integer,
  manual_refresh_cooldown_minutes integer
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.start_guarded_manual_run(now_utc);
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
  'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.scheduled_date) from history h), '[]'::jsonb),
  'refresh_policy', public.get_manual_refresh_policy(now())
);
$$;

grant execute on function public.get_manual_refresh_policy(timestamptz) to service_role;
grant execute on function public.start_guarded_manual_run(timestamptz) to service_role;
grant execute on function public.start_manual_run(timestamptz) to service_role;
grant execute on function public.get_dashboard_summary() to service_role;

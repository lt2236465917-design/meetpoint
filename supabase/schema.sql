create extension if not exists pgcrypto;

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  meeting_date date not null, -- Planned arrival date in Asia/Shanghai.
  participant_limit integer not null check (participant_limit between 2 and 6),
  status text not null default 'collecting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_calculated_at timestamptz
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  name text not null,
  departure_city_code text not null,
  departure_city_name text not null,
  accepted_modes text[] not null,
  created_by_host boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_credentials (
  plan_id uuid primary key references plans(id) on delete cascade,
  host_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists participant_credentials (
  participant_id uuid primary key references participants(id) on delete cascade,
  edit_token_hash text not null,
  created_at timestamptz not null default now()
);


create function create_plan_with_host_credential(
  p_code text,
  p_title text,
  p_meeting_date date,
  p_participant_limit integer,
  p_host_token_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  insert into public.plans (
    code,
    title,
    meeting_date,
    participant_limit,
    status
  )
  values (
    p_code,
    p_title,
    p_meeting_date,
    p_participant_limit,
    'collecting'
  )
  returning id into v_plan_id;

  insert into public.plan_credentials (plan_id, host_token_hash)
  values (v_plan_id, p_host_token_hash);

  return v_plan_id;
end;
$$;

create function create_participant_with_credential(
  p_code text,
  p_name text,
  p_departure_city_code text,
  p_departure_city_name text,
  p_accepted_modes text[],
  p_edit_token_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_participant_limit integer;
  v_participant_count integer;
  v_participant_id uuid;
begin
  select public.plans.id, public.plans.participant_limit
  into v_plan_id, v_participant_limit
  from public.plans
  where public.plans.code = p_code
  for update;

  if v_plan_id is null then
    raise exception using errcode = 'P0001', message = 'PLAN_NOT_FOUND';
  end if;

  select count(*)
  into v_participant_count
  from public.participants
  where public.participants.plan_id = v_plan_id;

  if v_participant_count >= v_participant_limit then
    raise exception using errcode = 'P0001', message = 'PARTICIPANT_LIMIT_REACHED';
  end if;

  insert into public.participants (
    plan_id,
    name,
    departure_city_code,
    departure_city_name,
    accepted_modes,
    created_by_host
  )
  values (
    v_plan_id,
    p_name,
    p_departure_city_code,
    p_departure_city_name,
    p_accepted_modes,
    false
  )
  returning id into v_participant_id;

  insert into public.participant_credentials (participant_id, edit_token_hash)
  values (v_participant_id, p_edit_token_hash);

  return v_participant_id;
end;
$$;

revoke execute on function create_plan_with_host_credential(
  text, text, date, integer, text
) from public, anon, authenticated;
revoke execute on function create_participant_with_credential(
  text, text, text, text, text[], text
) from public, anon, authenticated;
grant execute on function create_plan_with_host_credential(
  text, text, date, integer, text
) to service_role;
grant execute on function create_participant_with_credential(
  text, text, text, text, text[], text
) to service_role;


create table if not exists candidate_cities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  city_code text not null,
  city_name text not null,
  source text not null check (source in ('system', 'manual_add', 'manual_exclude')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(plan_id, city_code, source)
);

create table if not exists recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  status text not null check (
    status in (
      'pending',
      'collecting',
      'cooling_down',
      'calculating',
      'validating',
      'awaiting_host_confirmation',
      'completed',
      'incomplete',
      'failed'
    )
  ),
  kind text not null default 'automatic'
    check (kind in ('automatic', 'alternative')),
  requested_city_code text,
  requested_by_participant_id uuid references participants(id) on delete set null,
  policy_version text not null default '2026-07-19.v2',
  trace_id uuid not null default gen_random_uuid(),
  retry_after timestamptz,
  advance_lease_token uuid,
  advance_lease_expires_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  stale_after timestamptz,
  error_summary text,
  check (
    (kind = 'automatic' and requested_city_code is null and requested_by_participant_id is null)
    or
    (kind = 'alternative' and requested_city_code is not null and requested_by_participant_id is not null)
  )
);

create unique index if not exists recommendation_runs_one_active_per_plan
  on recommendation_runs (plan_id)
  where status in (
    'pending',
    'collecting',
    'cooling_down',
    'calculating',
    'validating',
    'awaiting_host_confirmation'
  );

create table if not exists travel_options (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  candidate_city_code text not null,
  mode text not null,
  source text not null check (source in ('real', 'estimated', 'unavailable')),
  provider text not null,
  queried_at timestamptz,
  price_cny integer,
  depart_at timestamptz,
  arrive_at timestamptz,
  duration_minutes integer,
  wait_minutes integer,
  is_direct boolean not null default false,
  has_transfer boolean not null default false,
  transfer_count integer not null default 0,
  service_name text,
  departure_station_name text,
  arrival_station_name text,
  booking_url text,
  failure_reason text,
  raw_payload_ref text
);

create table if not exists city_recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  city_code text not null,
  city_name text not null,
  total_price_cny integer not null,
  avg_price_cny integer not null,
  total_duration_minutes integer not null,
  fairness_gap integer not null,
  waiting_penalty integer not null,
  transfer_penalty integer not null,
  estimate_penalty integer not null,
  missing_penalty integer not null,
  score_cheapest integer not null,
  score_balanced integer not null,
  score_fastest integer not null,
  labels text[] not null default '{}',
  explanation text,
  risk_summary text
);

create table if not exists ai_explanations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  city_recommendation_id uuid references city_recommendations(id) on delete cascade,
  model text not null,
  input_hash text not null,
  output_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists route_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  city_code text not null,
  origin_city_code text not null,
  mode text not null check (mode in ('flight', 'high_speed_rail', 'normal_train')),
  search_date date not null,
  physical_key text not null,
  status text not null default 'pending' check (
    status in (
      'pending',
      'running',
      'succeeded',
      'empty',
      'retryable_failure',
      'terminal_failure'
    )
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  retry_after timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, participant_id, physical_key)
);

create table if not exists verified_quotes (
  id uuid primary key default gen_random_uuid(),
  route_task_id uuid not null references route_tasks(id) on delete cascade,
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  city_code text not null,
  quote_id text not null,
  provider_quote_id text,
  mode text not null check (mode in ('flight', 'high_speed_rail', 'normal_train')),
  search_date date not null,
  queried_at timestamptz not null,
  provider text not null,
  price_cny integer not null check (price_cny >= 0),
  depart_at timestamptz not null,
  arrive_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  transfer_count integer not null default 0 check (transfer_count >= 0),
  is_direct boolean not null,
  service_name text not null,
  departure_station_name text,
  arrival_station_name text,
  evidence_ref text,
  created_at timestamptz not null default now(),
  unique (run_id, participant_id, quote_id)
);

create table if not exists agent_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  trace_id uuid not null,
  agent_name text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists recommendation_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  version integer not null check (version > 0),
  policy_version text not null,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  output_json jsonb not null,
  validation_decision jsonb not null,
  supervisor_approved_version integer,
  supervisor_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (run_id, version),
  check (status <> 'approved' or supervisor_approved_version = version)
);

create table if not exists recommendation_results (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  run_id uuid not null unique references recommendation_runs(id) on delete cascade,
  proposal_id uuid not null unique references recommendation_proposals(id) on delete cascade,
  city_code text not null,
  explanation_zh text not null,
  is_shared boolean not null default false,
  published_at timestamptz,
  superseded_at timestamptz,
  superseded_by_result_id uuid references recommendation_results(id) on delete set null,
  created_at timestamptz not null default now(),
  check (not is_shared or published_at is not null)
);

create unique index if not exists recommendation_results_one_shared_per_plan
  on recommendation_results (plan_id)
  where is_shared and superseded_at is null;

create table if not exists recommendation_schemes (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references recommendation_results(id) on delete cascade,
  kind text not null check (kind in ('saving', 'fast')),
  total_fare_cny integer not null check (total_fare_cny >= 0),
  total_duration_minutes integer not null check (total_duration_minutes > 0),
  latest_arrival_at timestamptz not null,
  team_transfer_count integer not null default 0 check (team_transfer_count >= 0),
  created_at timestamptz not null default now(),
  unique (result_id, kind)
);

create table if not exists recommendation_scheme_routes (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references recommendation_schemes(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  verified_quote_id uuid not null references verified_quotes(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (scheme_id, participant_id),
  unique (scheme_id, verified_quote_id)
);

alter table plans enable row level security;
alter table participants enable row level security;
alter table candidate_cities enable row level security;
alter table recommendation_runs enable row level security;
alter table travel_options enable row level security;
alter table city_recommendations enable row level security;
alter table ai_explanations enable row level security;
alter table plan_credentials enable row level security;
alter table participant_credentials enable row level security;
alter table route_tasks enable row level security;
alter table verified_quotes enable row level security;
alter table agent_events enable row level security;
alter table recommendation_proposals enable row level security;
alter table recommendation_results enable row level security;
alter table recommendation_schemes enable row level security;
alter table recommendation_scheme_routes enable row level security;

revoke all on table public.plans from public, anon, authenticated;
revoke all on table public.participants from public, anon, authenticated;
revoke all on table public.candidate_cities from public, anon, authenticated;
revoke all on table public.recommendation_runs from public, anon, authenticated;
revoke all on table public.travel_options from public, anon, authenticated;
revoke all on table public.city_recommendations from public, anon, authenticated;
revoke all on table public.ai_explanations from public, anon, authenticated;
revoke all on table public.plan_credentials from public, anon, authenticated;
revoke all on table public.participant_credentials from public, anon, authenticated;
revoke all on table public.route_tasks from public, anon, authenticated;
revoke all on table public.verified_quotes from public, anon, authenticated;
revoke all on table public.agent_events from public, anon, authenticated;
revoke all on table public.recommendation_proposals from public, anon, authenticated;
revoke all on table public.recommendation_results from public, anon, authenticated;
revoke all on table public.recommendation_schemes from public, anon, authenticated;
revoke all on table public.recommendation_scheme_routes from public, anon, authenticated;

create function create_recommendation_run_matrix(
  p_run_id uuid,
  p_plan_id uuid,
  p_arrival_date date,
  p_candidates jsonb,
  p_tasks jsonb,
  p_kind text default 'automatic',
  p_requested_city_code text default null,
  p_requested_by_participant_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meeting_date date;
  v_active_run public.recommendation_runs%rowtype;
  v_has_shared_result boolean;
begin
  if p_run_id is null
    or p_plan_id is null
    or p_arrival_date is null
    or jsonb_typeof(p_candidates) is distinct from 'array'
    or jsonb_typeof(p_tasks) is distinct from 'array'
    or jsonb_array_length(p_candidates) = 0
    or jsonb_array_length(p_tasks) = 0
    or p_kind not in ('automatic', 'alternative')
    or (
      p_kind = 'automatic'
      and (p_requested_city_code is not null or p_requested_by_participant_id is not null)
    )
    or (
      p_kind = 'alternative'
      and (
        p_requested_city_code is null
        or p_requested_by_participant_id is null
        or jsonb_array_length(p_candidates) <> 1
        or p_candidates -> 0 ->> 'city_code' is distinct from p_requested_city_code
      )
    )
  then
    raise exception 'invalid run matrix input';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_candidates) as candidate(
      city_code text,
      city_name text,
      source text
    )
    where nullif(btrim(candidate.city_code), '') is null
      or nullif(btrim(candidate.city_name), '') is null
      or candidate.source is distinct from 'system'
  ) or (
    select count(distinct candidate.city_code)
    from jsonb_to_recordset(p_candidates) as candidate(city_code text)
  ) <> jsonb_array_length(p_candidates) then
    raise exception 'invalid candidate matrix';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_tasks) as task(
      id uuid,
      participant_id uuid,
      city_code text,
      origin_city_code text,
      mode text,
      search_date date,
      physical_key text
    )
    left join public.participants as participant
      on participant.id = task.participant_id
      and participant.plan_id = p_plan_id
    where task.id is null
      or participant.id is null
      or participant.departure_city_code is distinct from task.origin_city_code
      or not (task.mode = any (participant.accepted_modes))
      or nullif(btrim(task.city_code), '') is null
      or nullif(btrim(task.origin_city_code), '') is null
      or task.mode not in ('flight', 'high_speed_rail', 'normal_train')
      or task.search_date is null
      or task.physical_key is distinct from concat_ws(
        ':', task.origin_city_code, task.city_code, task.mode, task.search_date::text
      )
      or not exists (
        select 1
        from jsonb_to_recordset(p_candidates) as candidate(city_code text)
        where candidate.city_code = task.city_code
      )
  ) or (
    select count(distinct task.id)
    from jsonb_to_recordset(p_tasks) as task(id uuid)
  ) <> jsonb_array_length(p_tasks) then
    raise exception 'invalid route task matrix';
  end if;

  select public.plans.meeting_date
  into v_meeting_date
  from public.plans
  where public.plans.id = p_plan_id
  for update;
  if not found or v_meeting_date is distinct from p_arrival_date then
    raise exception 'plan arrival date mismatch';
  end if;

  if p_kind = 'alternative' and not exists (
    select 1
    from public.participants
    where public.participants.id = p_requested_by_participant_id
      and public.participants.plan_id = p_plan_id
  ) then
    raise exception 'alternative requester is not a plan participant';
  end if;

  select exists (
    select 1
    from public.recommendation_results
    where plan_id = p_plan_id
      and is_shared
      and superseded_at is null
  ) into v_has_shared_result;

  if p_kind = 'automatic' and v_has_shared_result then
    return jsonb_build_object('disposition', 'rejected', 'code', 'SHARED_RESULT_EXISTS');
  end if;
  if p_kind = 'alternative' and not v_has_shared_result then
    return jsonb_build_object('disposition', 'rejected', 'code', 'SHARED_RESULT_REQUIRED');
  end if;

  select * into v_active_run
  from public.recommendation_runs
  where plan_id = p_plan_id
    and status in (
      'pending', 'collecting', 'cooling_down', 'calculating',
      'validating', 'awaiting_host_confirmation'
    )
  for update;

  if found and v_active_run.stale_after <= now() then
    update public.recommendation_runs
    set status = 'failed', error_summary = 'RUN_STALE_EXPIRED', completed_at = now(),
        stale_after = null, advance_lease_token = null, advance_lease_expires_at = null
    where id = v_active_run.id and status = v_active_run.status;
    v_active_run := null;
  end if;

  if v_active_run.id is not null then
    if v_active_run.kind = p_kind and (
      p_kind = 'automatic'
      or (
        v_active_run.requested_city_code = p_requested_city_code
        and v_active_run.requested_by_participant_id = p_requested_by_participant_id
      )
    ) then
      return jsonb_build_object(
        'disposition', 'resume_existing', 'runId', v_active_run.id,
        'status', v_active_run.status, 'taskIds', '[]'::jsonb
      );
    end if;
    return jsonb_build_object('disposition', 'rejected', 'code', 'CALCULATION_IN_PROGRESS');
  end if;

  insert into public.recommendation_runs (
    id, plan_id, status, kind, requested_city_code, requested_by_participant_id,
    stale_after
  ) values (
    p_run_id, p_plan_id, 'pending', p_kind, p_requested_city_code,
    p_requested_by_participant_id, now() + interval '2 hours'
  );

  insert into public.candidate_cities (
    plan_id, city_code, city_name, source, enabled
  )
  select
    p_plan_id,
    candidate.city_code,
    candidate.city_name,
    candidate.source,
    true
  from jsonb_to_recordset(p_candidates) as candidate(
    city_code text,
    city_name text,
    source text
  )
  where p_kind = 'automatic'
  on conflict (plan_id, city_code, source) do update
  set city_name = excluded.city_name, enabled = true;

  insert into public.route_tasks (
    id,
    run_id,
    participant_id,
    city_code,
    origin_city_code,
    mode,
    search_date,
    physical_key,
    status
  )
  select
    task.id,
    p_run_id,
    task.participant_id,
    task.city_code,
    task.origin_city_code,
    task.mode,
    task.search_date,
    task.physical_key,
    'pending'
  from jsonb_to_recordset(p_tasks) as task(
    id uuid,
    participant_id uuid,
    city_code text,
    origin_city_code text,
    mode text,
    search_date date,
    physical_key text
  );

  return jsonb_build_object(
    'disposition', 'created',
    'runId', p_run_id,
    'status', 'pending',
    'taskIds', (
      select coalesce(jsonb_agg(entry.value -> 'id' order by entry.ordinality), '[]'::jsonb)
      from jsonb_array_elements(p_tasks) with ordinality as entry(value, ordinality)
    )
  );
end;
$$;

create function save_route_task_outcome(
  p_task_id uuid,
  p_outcome jsonb,
  p_quotes jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task public.route_tasks%rowtype;
  v_status text;
  v_task_status text;
  v_error_code text;
  v_retry_after timestamptz;
  v_meeting_date date;
  v_expected_quote_count integer;
  v_persisted_quote_count integer;
  v_updated_count integer;
begin
  if p_task_id is null
    or jsonb_typeof(p_outcome) is distinct from 'object'
    or jsonb_typeof(p_quotes) is distinct from 'array'
  then
    raise exception 'invalid route task outcome input';
  end if;

  select *
  into v_task
  from public.route_tasks
  where public.route_tasks.id = p_task_id
    and public.route_tasks.status = 'running'
  for update;
  if not found then
    raise exception 'route task must be running';
  end if;

  v_status := p_outcome ->> 'status';
  v_error_code := nullif(btrim(p_outcome ->> 'code'), '');
  if (p_outcome - array['status', 'code', 'retry_after']) <> '{}'::jsonb then
    raise exception 'invalid route task outcome fields';
  end if;
  case v_status
    when 'success' then v_task_status := 'succeeded';
    when 'empty' then v_task_status := 'empty';
    when 'retryable_failure' then v_task_status := 'retryable_failure';
    when 'terminal_failure' then v_task_status := 'terminal_failure';
    else raise exception 'invalid route task outcome status';
  end case;

  if (v_status = 'success' and jsonb_array_length(p_quotes) = 0)
    or (v_status <> 'success' and jsonb_array_length(p_quotes) <> 0)
    or (v_status in ('retryable_failure', 'terminal_failure') and v_error_code is null)
  then
    raise exception 'invalid route task outcome payload';
  end if;

  if v_status = 'retryable_failure' then
    begin
      v_retry_after := (p_outcome ->> 'retry_after')::timestamptz;
    exception when others then
      raise exception 'invalid retry_after';
    end;
  end if;

  if v_status = 'success' then
    select public.plans.meeting_date
    into v_meeting_date
    from public.recommendation_runs
    join public.plans on public.plans.id = public.recommendation_runs.plan_id
    where public.recommendation_runs.id = v_task.run_id;

    if exists (
      select 1
      from jsonb_to_recordset(p_quotes) as quote(
        id uuid,
        participant_id uuid,
        city_code text,
        quote_id text,
        provider_quote_id text,
        mode text,
        search_date date,
        queried_at timestamptz,
        provider text,
        price_cny integer,
        depart_at timestamptz,
        arrive_at timestamptz,
        duration_minutes integer,
        transfer_count integer,
        is_direct boolean,
        service_name text,
        evidence_ref text
      )
      where quote.id is null
        or quote.participant_id is distinct from v_task.participant_id
        or quote.city_code is distinct from v_task.city_code
        or quote.mode is distinct from v_task.mode
        or quote.search_date is distinct from v_task.search_date
        or quote.provider is distinct from 'flyai'
        or quote.quote_id !~ '^flyai:[0-9a-f]{64}$'
        or quote.evidence_ref is distinct from quote.quote_id
        or quote.queried_at is null
        or quote.price_cny < 0
        or quote.depart_at is null
        or quote.arrive_at is null
        or (quote.arrive_at at time zone 'Asia/Shanghai')::date is distinct from v_meeting_date
        or quote.duration_minutes <= 0
        or quote.transfer_count < 0
        or quote.is_direct is null
        or nullif(btrim(quote.service_name), '') is null
    ) then
      raise exception 'invalid verified quote evidence';
    end if;

    insert into public.verified_quotes (
      id,
      route_task_id,
      run_id,
      participant_id,
      city_code,
      quote_id,
      provider_quote_id,
      mode,
      search_date,
      queried_at,
      provider,
      price_cny,
      depart_at,
      arrive_at,
      duration_minutes,
      transfer_count,
      is_direct,
      service_name,
      evidence_ref
    )
    select distinct on (quote.quote_id)
      quote.id,
      p_task_id,
      v_task.run_id,
      quote.participant_id,
      quote.city_code,
      quote.quote_id,
      quote.provider_quote_id,
      quote.mode,
      quote.search_date,
      quote.queried_at,
      quote.provider,
      quote.price_cny,
      quote.depart_at,
      quote.arrive_at,
      quote.duration_minutes,
      quote.transfer_count,
      quote.is_direct,
      quote.service_name,
      quote.evidence_ref
    from jsonb_to_recordset(p_quotes) as quote(
      id uuid,
      participant_id uuid,
      city_code text,
      quote_id text,
      provider_quote_id text,
      mode text,
      search_date date,
      queried_at timestamptz,
      provider text,
      price_cny integer,
      depart_at timestamptz,
      arrive_at timestamptz,
      duration_minutes integer,
      transfer_count integer,
      is_direct boolean,
      service_name text,
      evidence_ref text
    )
    order by quote.quote_id, quote.id
    on conflict (run_id, participant_id, quote_id) do nothing;

    select count(distinct quote.quote_id)
    into v_expected_quote_count
    from jsonb_to_recordset(p_quotes) as quote(quote_id text);
    select count(*)
    into v_persisted_quote_count
    from public.verified_quotes
    where public.verified_quotes.route_task_id = p_task_id
      and public.verified_quotes.run_id = v_task.run_id
      and public.verified_quotes.participant_id = v_task.participant_id
      and public.verified_quotes.city_code = v_task.city_code
      and public.verified_quotes.mode = v_task.mode
      and public.verified_quotes.search_date = v_task.search_date
      and public.verified_quotes.quote_id in (
        select quote.quote_id
        from jsonb_to_recordset(p_quotes) as quote(quote_id text)
      );
    if v_persisted_quote_count <> v_expected_quote_count then
      raise exception 'verified quote conflict';
    end if;
  end if;

  update public.route_tasks
  set
    status = v_task_status,
    retry_after = case when v_status = 'retryable_failure' then v_retry_after else null end,
    error_code = case
      when v_status in ('retryable_failure', 'terminal_failure') then v_error_code
      else null
    end,
    updated_at = now()
  where public.route_tasks.id = p_task_id
    and public.route_tasks.status = 'running';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'route task outcome compare-and-set failed';
  end if;

  update public.recommendation_runs
  set stale_after = now() + interval '2 hours'
  where id = v_task.run_id
    and status in ('pending', 'collecting', 'cooling_down', 'calculating', 'validating');

  return true;
end;
$$;

create function terminalize_route_task_recovery(
  p_task_id uuid,
  p_error_code text,
  p_stale_after timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  update public.route_tasks
  set status = 'terminal_failure', retry_after = null,
      error_code = coalesce(nullif(btrim(p_error_code), ''), 'ROUTE_RECOVERY_EXHAUSTED'),
      updated_at = now()
  where id = p_task_id and status = 'retryable_failure'
  returning run_id into v_run_id;
  if not found then return false; end if;

  update public.recommendation_runs
  set stale_after = p_stale_after
  where id = v_run_id
    and status in ('pending', 'collecting', 'cooling_down', 'calculating', 'validating');
  return true;
end;
$$;

create function publish_shared_result(p_run_id uuid, p_proposal_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
  v_proposal public.recommendation_proposals%rowtype;
  v_result public.recommendation_results%rowtype;
  v_plan_id uuid;
  v_meeting_date date;
  v_participant_count integer;
begin
  select public.recommendation_runs.plan_id into v_plan_id
  from public.recommendation_runs
  where public.recommendation_runs.id = p_run_id;
  if not found then raise exception 'run not found'; end if;

  select public.plans.meeting_date into v_meeting_date
  from public.plans
  where public.plans.id = v_plan_id
  for update;

  select * into v_run
  from public.recommendation_runs
  where public.recommendation_runs.id = p_run_id
  for update;
  if not found or v_run.plan_id is distinct from v_plan_id then
    raise exception 'run not found';
  end if;
  if v_run.kind <> 'automatic' then
    raise exception 'automatic publication requires an automatic run';
  end if;
  if v_run.status <> 'validating' then
    raise exception 'automatic run must be validating';
  end if;

  select * into v_proposal
  from public.recommendation_proposals
  where public.recommendation_proposals.id = p_proposal_id
    and public.recommendation_proposals.run_id = p_run_id
  for update;
  if not found
    or v_proposal.status <> 'approved'
    or v_proposal.policy_version <> v_run.policy_version
    or v_proposal.supervisor_approved_version is distinct from v_proposal.version
    or not (v_proposal.validation_decision @> '{"ok": true}'::jsonb)
  then
    raise exception 'proposal is not approved for this run and policy';
  end if;

  select * into v_result
  from public.recommendation_results
  where public.recommendation_results.run_id = p_run_id
    and public.recommendation_results.proposal_id = p_proposal_id
  for update;
  if not found
    or v_result.plan_id <> v_run.plan_id
    or v_result.is_shared
    or v_proposal.output_json ->> 'status' is distinct from 'proposal'
    or v_result.city_code is distinct from v_proposal.output_json ->> 'cityCode'
    or coalesce(jsonb_array_length(v_proposal.output_json -> 'schemes'), 0) <> 2
    or v_proposal.output_json #>> '{schemes,0,kind}' is distinct from 'saving'
    or v_proposal.output_json #>> '{schemes,1,kind}' is distinct from 'fast'
  then
    raise exception 'exactly one matching result is required';
  end if;
  if exists (
    select 1 from public.recommendation_results
    where public.recommendation_results.plan_id = v_run.plan_id
      and public.recommendation_results.is_shared
      and public.recommendation_results.superseded_at is null
  ) then
    raise exception 'shared result already exists';
  end if;

  select count(*) into v_participant_count
  from public.participants
  where public.participants.plan_id = v_run.plan_id;
  if v_participant_count = 0
    or (select count(*) from public.recommendation_schemes where result_id = v_result.id) <> 2
    or (select count(distinct kind) from public.recommendation_schemes where result_id = v_result.id) <> 2
    or exists (
      select 1 from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
        and (select count(*) from public.recommendation_scheme_routes as scheme_route
          where scheme_route.scheme_id = scheme.id) <> v_participant_count
    )
    or exists (
      select 1
      from public.recommendation_scheme_routes as scheme_route
      join public.recommendation_schemes as scheme on scheme.id = scheme_route.scheme_id
      left join public.participants as participant
        on participant.id = scheme_route.participant_id
        and participant.plan_id = v_run.plan_id
      left join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
      where scheme.result_id = v_result.id
        and (participant.id is null
          or quote.id is null
          or quote.run_id <> p_run_id
          or quote.participant_id <> scheme_route.participant_id
          or quote.city_code <> v_result.city_code
          or not (quote.mode = any (participant.accepted_modes))
          or (quote.arrive_at at time zone 'Asia/Shanghai')::date <> v_meeting_date
          or quote.quote_id is distinct from v_proposal.output_json #>> array[
            'schemes',
            case when scheme.kind = 'saving' then '0' else '1' end,
            'quoteIdsByParticipant',
            scheme_route.participant_id::text
          ])
    )
    or exists (
      select 1 from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
        and ((select count(*) from jsonb_object_keys(
          v_proposal.output_json -> 'schemes'
            -> (case when scheme.kind = 'saving' then 0 else 1 end)
            -> 'quoteIdsByParticipant'
        )) <> v_participant_count
        or scheme.total_fare_cny is distinct from (
          v_proposal.output_json #>> array[
            'schemes',
            case when scheme.kind = 'saving' then '0' else '1' end,
            'totalFareCny'
          ])::integer
        or scheme.total_fare_cny <> (
          select coalesce(sum(quote.price_cny), 0)
          from public.recommendation_scheme_routes as scheme_route
          join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
          where scheme_route.scheme_id = scheme.id)
        or scheme.total_duration_minutes <> (
          select coalesce(sum(quote.duration_minutes), 0)
          from public.recommendation_scheme_routes as scheme_route
          join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
          where scheme_route.scheme_id = scheme.id))
    )
  then
    raise exception 'result evidence or participant coverage is invalid';
  end if;

  update public.recommendation_results
  set is_shared = true, published_at = now()
  where public.recommendation_results.id = v_result.id;
  update public.recommendation_runs
  set status = 'completed', completed_at = now(), retry_after = null,
      stale_after = null, advance_lease_token = null, advance_lease_expires_at = null
  where public.recommendation_runs.id = p_run_id;
  return v_result.id;
end;
$$;

create function confirm_alternative_result(
  p_run_id uuid,
  p_proposal_id uuid,
  p_host_token_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
  v_proposal public.recommendation_proposals%rowtype;
  v_result public.recommendation_results%rowtype;
  v_current_result_id uuid;
  v_plan_id uuid;
  v_meeting_date date;
  v_participant_count integer;
begin
  select public.recommendation_runs.plan_id into v_plan_id
  from public.recommendation_runs
  where public.recommendation_runs.id = p_run_id;
  if not found then raise exception 'run not found'; end if;

  select public.plans.meeting_date into v_meeting_date
  from public.plans
  where public.plans.id = v_plan_id
  for update;

  select * into v_run
  from public.recommendation_runs
  where public.recommendation_runs.id = p_run_id
  for update;
  if not found or v_run.plan_id is distinct from v_plan_id then
    raise exception 'run not found';
  end if;
  if v_run.kind <> 'alternative' then
    raise exception 'host confirmation requires an alternative run';
  end if;
  if v_run.status <> 'awaiting_host_confirmation' then
    raise exception 'alternative run must await host confirmation';
  end if;

  if p_host_token_hash is null or not exists (
    select 1 from public.plan_credentials
    where public.plan_credentials.plan_id = v_run.plan_id
      and public.plan_credentials.host_token_hash = p_host_token_hash
  ) then
    raise exception 'invalid host credential';
  end if;

  if v_run.status = 'awaiting_host_confirmation'
    and (v_run.stale_after is null or v_run.stale_after <= now())
  then
    update public.recommendation_runs
    set status = 'failed', error_summary = 'RUN_STALE_EXPIRED', completed_at = now(),
        stale_after = null, advance_lease_token = null, advance_lease_expires_at = null
    where id = p_run_id and status = 'awaiting_host_confirmation';
    return jsonb_build_object('disposition', 'rejected', 'code', 'PREVIEW_EXPIRED');
  end if;

  select * into v_proposal
  from public.recommendation_proposals
  where public.recommendation_proposals.id = p_proposal_id
    and public.recommendation_proposals.run_id = p_run_id
  for update;
  if not found
    or v_proposal.status <> 'approved'
    or v_proposal.policy_version <> v_run.policy_version
    or v_proposal.supervisor_approved_version is distinct from v_proposal.version
    or not (v_proposal.validation_decision @> '{"ok": true}'::jsonb)
  then
    raise exception 'proposal is not approved for this run and policy';
  end if;

  select * into v_result
  from public.recommendation_results
  where public.recommendation_results.run_id = p_run_id
    and public.recommendation_results.proposal_id = p_proposal_id
  for update;
  if not found
    or v_result.plan_id <> v_run.plan_id
    or v_result.city_code <> v_run.requested_city_code
    or v_result.is_shared
    or v_proposal.output_json ->> 'status' is distinct from 'proposal'
    or v_result.city_code is distinct from v_proposal.output_json ->> 'cityCode'
    or coalesce(jsonb_array_length(v_proposal.output_json -> 'schemes'), 0) <> 2
    or v_proposal.output_json #>> '{schemes,0,kind}' is distinct from 'saving'
    or v_proposal.output_json #>> '{schemes,1,kind}' is distinct from 'fast'
  then
    raise exception 'exactly one matching alternative result is required';
  end if;

  select public.recommendation_results.id into v_current_result_id
  from public.recommendation_results
  where public.recommendation_results.plan_id = v_run.plan_id
    and public.recommendation_results.is_shared
    and public.recommendation_results.superseded_at is null
  for update;
  if not found then raise exception 'no shared result to replace'; end if;

  select count(*) into v_participant_count
  from public.participants
  where public.participants.plan_id = v_run.plan_id;
  if v_participant_count = 0
    or (select count(*) from public.recommendation_schemes where result_id = v_result.id) <> 2
    or (select count(distinct kind) from public.recommendation_schemes where result_id = v_result.id) <> 2
    or exists (
      select 1 from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
        and (select count(*) from public.recommendation_scheme_routes as scheme_route
          where scheme_route.scheme_id = scheme.id) <> v_participant_count
    )
    or exists (
      select 1
      from public.recommendation_scheme_routes as scheme_route
      join public.recommendation_schemes as scheme on scheme.id = scheme_route.scheme_id
      left join public.participants as participant
        on participant.id = scheme_route.participant_id
        and participant.plan_id = v_run.plan_id
      left join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
      where scheme.result_id = v_result.id
        and (participant.id is null
          or quote.id is null
          or quote.run_id <> p_run_id
          or quote.participant_id <> scheme_route.participant_id
          or quote.city_code <> v_result.city_code
          or not (quote.mode = any (participant.accepted_modes))
          or (quote.arrive_at at time zone 'Asia/Shanghai')::date <> v_meeting_date
          or quote.quote_id is distinct from v_proposal.output_json #>> array[
            'schemes',
            case when scheme.kind = 'saving' then '0' else '1' end,
            'quoteIdsByParticipant',
            scheme_route.participant_id::text
          ])
    )
    or exists (
      select 1 from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
        and ((select count(*) from jsonb_object_keys(
          v_proposal.output_json -> 'schemes'
            -> (case when scheme.kind = 'saving' then 0 else 1 end)
            -> 'quoteIdsByParticipant'
        )) <> v_participant_count
        or scheme.total_fare_cny is distinct from (
          v_proposal.output_json #>> array[
            'schemes',
            case when scheme.kind = 'saving' then '0' else '1' end,
            'totalFareCny'
          ])::integer
        or scheme.total_fare_cny <> (
          select coalesce(sum(quote.price_cny), 0)
          from public.recommendation_scheme_routes as scheme_route
          join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
          where scheme_route.scheme_id = scheme.id)
        or scheme.total_duration_minutes <> (
          select coalesce(sum(quote.duration_minutes), 0)
          from public.recommendation_scheme_routes as scheme_route
          join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
          where scheme_route.scheme_id = scheme.id))
    )
  then
    raise exception 'result evidence or participant coverage is invalid';
  end if;

  update public.recommendation_results
  set superseded_at = now(), superseded_by_result_id = v_result.id
  where public.recommendation_results.id = v_current_result_id;
  update public.recommendation_results
  set is_shared = true, published_at = now()
  where public.recommendation_results.id = v_result.id;
  update public.recommendation_runs
  set status = 'completed', completed_at = now(), retry_after = null,
      stale_after = null, advance_lease_token = null, advance_lease_expires_at = null
  where public.recommendation_runs.id = p_run_id;
  return jsonb_build_object(
    'disposition', 'completed',
    'resultId', v_result.id
  );
end;
$$;

revoke execute on function create_recommendation_run_matrix(uuid, uuid, date, jsonb, jsonb, text, text, uuid)
  from public, anon, authenticated;
revoke execute on function save_route_task_outcome(uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function terminalize_route_task_recovery(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function publish_shared_result(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function confirm_alternative_result(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function create_recommendation_run_matrix(uuid, uuid, date, jsonb, jsonb, text, text, uuid)
  to service_role;
grant execute on function save_route_task_outcome(uuid, jsonb, jsonb)
  to service_role;
grant execute on function terminalize_route_task_recovery(uuid, text, timestamptz)
  to service_role;
grant execute on function publish_shared_result(uuid, uuid) to service_role;
grant execute on function confirm_alternative_result(uuid, uuid, text) to service_role;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.assert_recommendation_evidence_v2(
  p_run_id uuid
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
begin
  select * into v_run
  from public.recommendation_runs
  where id = p_run_id;

  if not found or v_run.policy_version <> '2026-07-19.v2' then
    raise exception 'unsupported recommendation policy';
  end if;

  if exists (
    select 1
    from public.verified_quotes as quote
    left join public.route_tasks as task
      on task.id = quote.route_task_id
    left join public.participants as participant
      on participant.id = quote.participant_id
    left join public.plans as plan
      on plan.id = v_run.plan_id
    where quote.run_id = p_run_id
      and (
        task.id is null
        or task.run_id <> p_run_id
        or task.participant_id <> quote.participant_id
        or task.city_code <> quote.city_code
        or task.mode <> quote.mode
        or task.search_date <> quote.search_date
        or participant.id is null
        or participant.plan_id <> v_run.plan_id
        or plan.id is null
        or not (quote.mode = any (participant.accepted_modes))
        or (quote.arrive_at at time zone 'Asia/Shanghai')::date <> plan.meeting_date
      )
  ) then
    raise exception 'recommendation evidence mismatch';
  end if;
end;
$$;

create or replace function private.recommendation_policy_eligible_quotes_v2(
  p_run_id uuid
)
returns table (
  city_code text,
  participant_id uuid,
  verified_quote_id uuid,
  quote_id text,
  price_cny integer,
  duration_minutes integer,
  transfer_count integer,
  is_direct boolean,
  arrive_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_recommendation_evidence_v2(p_run_id);

  return query
  with base as (
    select
      quote.city_code,
      quote.participant_id,
      quote.id as verified_quote_id,
      quote.quote_id,
      quote.price_cny,
      quote.duration_minutes,
      quote.transfer_count,
      quote.is_direct,
      quote.arrive_at
    from public.verified_quotes as quote
    where quote.run_id = p_run_id
  )
  select
    base.city_code,
    base.participant_id,
    base.verified_quote_id,
    base.quote_id,
    base.price_cny,
    base.duration_minutes,
    base.transfer_count,
    base.is_direct,
    base.arrive_at
  from base
  where base.is_direct
    or not exists (
      select 1
      from base as direct_quote
      where direct_quote.city_code = base.city_code
        and direct_quote.participant_id = base.participant_id
        and direct_quote.is_direct
    );
end;
$$;

create or replace function private.recommendation_policy_saving_v2(
  p_run_id uuid
)
returns table (
  city_code text,
  participant_id uuid,
  verified_quote_id uuid,
  quote_id text,
  price_cny integer,
  duration_minutes integer,
  transfer_count integer,
  is_direct boolean,
  arrive_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ranked.city_code,
    ranked.participant_id,
    ranked.verified_quote_id,
    ranked.quote_id,
    ranked.price_cny,
    ranked.duration_minutes,
    ranked.transfer_count,
    ranked.is_direct,
    ranked.arrive_at
  from (
    select
      eligible.*,
      row_number() over (
        partition by eligible.city_code, eligible.participant_id
        order by
          eligible.price_cny,
          eligible.transfer_count,
          eligible.duration_minutes,
          eligible.quote_id collate "C"
      ) as saving_rank
    from private.recommendation_policy_eligible_quotes_v2(p_run_id) as eligible
  ) as ranked
  where ranked.saving_rank = 1
$$;

revoke all on function private.assert_recommendation_evidence_v2(uuid)
  from public, anon, authenticated;
revoke all on function private.recommendation_policy_eligible_quotes_v2(uuid)
  from public, anon, authenticated;
revoke all on function private.recommendation_policy_saving_v2(uuid)
  from public, anon, authenticated;
grant execute on function private.assert_recommendation_evidence_v2(uuid)
  to service_role;
grant execute on function private.recommendation_policy_eligible_quotes_v2(uuid)
  to service_role;
grant execute on function private.recommendation_policy_saving_v2(uuid)
  to service_role;


create or replace function private.recommendation_policy_fast_v2(
  p_run_id uuid
)
returns table (
  city_code text,
  participant_id uuid,
  verified_quote_id uuid,
  quote_id text,
  price_cny integer,
  duration_minutes integer,
  transfer_count integer,
  is_direct boolean,
  arrive_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
  v_city record;
  v_participant_id uuid;
  v_participant_count integer;
  v_quote_count bigint;
  v_state_count bigint;
  v_transition_count bigint;
  v_selected_quote_ids uuid[];
begin
  perform private.assert_recommendation_evidence_v2(p_run_id);

  select * into v_run
  from public.recommendation_runs
  where id = p_run_id;

  select count(*) into v_participant_count
  from public.participants
  where plan_id = v_run.plan_id;

  if v_participant_count = 0 then
    return;
  end if;

  create temporary table if not exists policy_fast_current (
    total_fare integer primary key,
    total_duration bigint not null,
    latest_arrival timestamptz not null,
    total_transfers bigint not null,
    quote_row_ids uuid[] not null,
    quote_ids text[] collate "C" not null
  ) on commit drop;

  create temporary table if not exists policy_fast_next (
    total_fare integer primary key,
    total_duration bigint not null,
    latest_arrival timestamptz not null,
    total_transfers bigint not null,
    quote_row_ids uuid[] not null,
    quote_ids text[] collate "C" not null
  ) on commit drop;

  for v_city in
    select
      saving.city_code,
      sum(saving.price_cny)::integer as saving_total
    from private.recommendation_policy_saving_v2(p_run_id) as saving
    group by saving.city_code
    having count(*) = v_participant_count
    order by saving.city_code collate "C"
  loop
    truncate table pg_temp.policy_fast_current;
    truncate table pg_temp.policy_fast_next;
    insert into pg_temp.policy_fast_current (
      total_fare,
      total_duration,
      latest_arrival,
      total_transfers,
      quote_row_ids,
      quote_ids
    )
    values (0, 0, '-infinity'::timestamptz, 0, array[]::uuid[], array[]::text[]);

    v_transition_count := 0;

    for v_participant_id in
      select participant.id
      from public.participants as participant
      where participant.plan_id = v_run.plan_id
      order by participant.id
    loop
      select count(*) into v_quote_count
      from private.recommendation_policy_eligible_quotes_v2(p_run_id) as eligible
      where eligible.city_code = v_city.city_code
        and eligible.participant_id = v_participant_id;

      select count(*) into v_state_count
      from pg_temp.policy_fast_current;

      v_transition_count := v_transition_count + (v_state_count * v_quote_count);
      if v_transition_count > 200000 then
        raise exception 'recommendation policy transition budget exceeded';
      end if;

      if v_quote_count = 0 or v_state_count = 0 then
        truncate table pg_temp.policy_fast_current;
        exit;
      end if;

      insert into pg_temp.policy_fast_next (
        total_fare,
        total_duration,
        latest_arrival,
        total_transfers,
        quote_row_ids,
        quote_ids
      )
      select distinct on (candidate.total_fare)
        candidate.total_fare,
        candidate.total_duration,
        candidate.latest_arrival,
        candidate.total_transfers,
        candidate.quote_row_ids,
        candidate.quote_ids
      from (
        select
          current_state.total_fare + eligible.price_cny as total_fare,
          current_state.total_duration + eligible.duration_minutes as total_duration,
          greatest(current_state.latest_arrival, eligible.arrive_at) as latest_arrival,
          current_state.total_transfers + eligible.transfer_count as total_transfers,
          current_state.quote_row_ids || eligible.verified_quote_id as quote_row_ids,
          current_state.quote_ids || eligible.quote_id as quote_ids
        from pg_temp.policy_fast_current as current_state
        cross join private.recommendation_policy_eligible_quotes_v2(p_run_id) as eligible
        where eligible.city_code = v_city.city_code
          and eligible.participant_id = v_participant_id
          and (current_state.total_fare + eligible.price_cny) * 10
            <= v_city.saving_total * 13
      ) as candidate
      order by
        candidate.total_fare,
        candidate.total_duration,
        candidate.latest_arrival,
        candidate.total_transfers,
        candidate.quote_ids collate "C";

      select count(*) into v_state_count
      from pg_temp.policy_fast_next;
      if v_state_count > 50000 then
        raise exception 'recommendation policy state budget exceeded';
      end if;

      truncate table pg_temp.policy_fast_current;
      insert into pg_temp.policy_fast_current
      select * from pg_temp.policy_fast_next;
      truncate table pg_temp.policy_fast_next;
    end loop;

    select current_state.quote_row_ids
    into v_selected_quote_ids
    from pg_temp.policy_fast_current as current_state
    order by
      current_state.total_duration,
      current_state.latest_arrival,
      current_state.total_transfers,
      current_state.total_fare,
      current_state.quote_ids collate "C"
    limit 1;

    if v_selected_quote_ids is not null then
      return query
      select
        eligible.city_code,
        eligible.participant_id,
        eligible.verified_quote_id,
        eligible.quote_id,
        eligible.price_cny,
        eligible.duration_minutes,
        eligible.transfer_count,
        eligible.is_direct,
        eligible.arrive_at
      from unnest(v_selected_quote_ids) with ordinality as selected(verified_quote_id, position)
      join private.recommendation_policy_eligible_quotes_v2(p_run_id) as eligible
        on eligible.verified_quote_id = selected.verified_quote_id
      order by selected.position;
    end if;

    v_selected_quote_ids := null;
  end loop;
end;
$$;

revoke all on function private.recommendation_policy_fast_v2(uuid)
  from public, anon, authenticated;
grant execute on function private.recommendation_policy_fast_v2(uuid)
  to service_role;

create or replace function private.recommendation_policy_projection(
  p_run_id uuid
)
returns table (
  rank_position bigint,
  city_code text,
  saving_total_fare integer,
  saving_total_duration integer,
  saving_latest_arrival timestamptz,
  saving_total_transfers integer,
  direct_participant_count integer,
  fare_fairness_gap integer,
  saving_quote_ids jsonb,
  saving_verified_quote_ids jsonb,
  fast_total_fare integer,
  fast_total_duration integer,
  fast_latest_arrival timestamptz,
  fast_total_transfers integer,
  fast_quote_ids jsonb,
  fast_verified_quote_ids jsonb
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
  v_participant_count integer;
begin
  select * into v_run
  from public.recommendation_runs
  where id = p_run_id;

  if not found or v_run.policy_version <> '2026-07-19.v2' then
    raise exception 'unsupported recommendation policy';
  end if;

  select count(*) into v_participant_count
  from public.participants
  where plan_id = v_run.plan_id;

  return query
  with saving as (
    select
      selected.city_code,
      count(*)::integer as coverage_count,
      sum(selected.price_cny)::integer as total_fare,
      sum(selected.duration_minutes)::integer as total_duration,
      max(selected.arrive_at) as latest_arrival,
      sum(selected.transfer_count)::integer as total_transfers,
      count(*) filter (where selected.is_direct)::integer as direct_count,
      (max(selected.price_cny) - min(selected.price_cny))::integer as fairness_gap,
      jsonb_object_agg(
        selected.participant_id::text,
        selected.quote_id
        order by selected.participant_id
      ) as quote_ids,
      jsonb_object_agg(
        selected.participant_id::text,
        selected.verified_quote_id::text
        order by selected.participant_id
      ) as verified_quote_ids
    from private.recommendation_policy_saving_v2(p_run_id) as selected
    group by selected.city_code
  ),
  fast as (
    select
      selected.city_code,
      count(*)::integer as coverage_count,
      sum(selected.price_cny)::integer as total_fare,
      sum(selected.duration_minutes)::integer as total_duration,
      max(selected.arrive_at) as latest_arrival,
      sum(selected.transfer_count)::integer as total_transfers,
      jsonb_object_agg(
        selected.participant_id::text,
        selected.quote_id
        order by selected.participant_id
      ) as quote_ids,
      jsonb_object_agg(
        selected.participant_id::text,
        selected.verified_quote_id::text
        order by selected.participant_id
      ) as verified_quote_ids
    from private.recommendation_policy_fast_v2(p_run_id) as selected
    group by selected.city_code
  ),
  eligible as (
    select
      saving.city_code,
      saving.total_fare as saving_total_fare,
      saving.total_duration as saving_total_duration,
      saving.latest_arrival as saving_latest_arrival,
      saving.total_transfers as saving_total_transfers,
      saving.direct_count as direct_participant_count,
      saving.fairness_gap as fare_fairness_gap,
      saving.quote_ids as saving_quote_ids,
      saving.verified_quote_ids as saving_verified_quote_ids,
      fast.total_fare as fast_total_fare,
      fast.total_duration as fast_total_duration,
      fast.latest_arrival as fast_latest_arrival,
      fast.total_transfers as fast_total_transfers,
      fast.quote_ids as fast_quote_ids,
      fast.verified_quote_ids as fast_verified_quote_ids
    from saving
    join fast using (city_code)
    where saving.coverage_count = v_participant_count
      and fast.coverage_count = v_participant_count
  )
  select
    row_number() over (
      order by
        eligible.saving_total_fare,
        eligible.direct_participant_count desc,
        eligible.fare_fairness_gap,
        eligible.saving_total_duration,
        eligible.city_code collate "C"
    ),
    eligible.city_code,
    eligible.saving_total_fare,
    eligible.saving_total_duration,
    eligible.saving_latest_arrival,
    eligible.saving_total_transfers,
    eligible.direct_participant_count,
    eligible.fare_fairness_gap,
    eligible.saving_quote_ids,
    eligible.saving_verified_quote_ids,
    eligible.fast_total_fare,
    eligible.fast_total_duration,
    eligible.fast_latest_arrival,
    eligible.fast_total_transfers,
    eligible.fast_quote_ids,
    eligible.fast_verified_quote_ids
  from eligible
  order by 1;
end;
$$;

revoke all on function private.recommendation_policy_projection(uuid)
  from public, anon, authenticated;
grant execute on function private.recommendation_policy_projection(uuid)
  to service_role;

create or replace function private.assert_recommendation_proposal(
  p_run_id uuid,
  p_proposal_id uuid
)
returns table (
  rank_position bigint,
  city_code text,
  saving_total_fare integer,
  saving_total_duration integer,
  saving_latest_arrival timestamptz,
  saving_total_transfers integer,
  direct_participant_count integer,
  fare_fairness_gap integer,
  saving_quote_ids jsonb,
  saving_verified_quote_ids jsonb,
  fast_total_fare integer,
  fast_total_duration integer,
  fast_latest_arrival timestamptz,
  fast_total_transfers integer,
  fast_quote_ids jsonb,
  fast_verified_quote_ids jsonb
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
  v_proposal public.recommendation_proposals%rowtype;
  v_selected record;
  v_eligible_city_codes jsonb;
  v_ordered_city_codes jsonb;
begin
  select * into v_run
  from public.recommendation_runs
  where id = p_run_id;

  select * into v_proposal
  from public.recommendation_proposals
  where id = p_proposal_id
    and run_id = p_run_id;

  if v_run.id is null
    or v_proposal.id is null
    or v_run.policy_version <> '2026-07-19.v2'
    or v_proposal.policy_version <> v_run.policy_version
  then
    raise exception 'unsupported recommendation policy';
  end if;

  create temporary table if not exists policy_projection_cache (
    rank_position bigint not null,
    city_code text not null,
    saving_total_fare integer not null,
    saving_total_duration integer not null,
    saving_latest_arrival timestamptz not null,
    saving_total_transfers integer not null,
    direct_participant_count integer not null,
    fare_fairness_gap integer not null,
    saving_quote_ids jsonb not null,
    saving_verified_quote_ids jsonb not null,
    fast_total_fare integer not null,
    fast_total_duration integer not null,
    fast_latest_arrival timestamptz not null,
    fast_total_transfers integer not null,
    fast_quote_ids jsonb not null,
    fast_verified_quote_ids jsonb not null
  ) on commit drop;

  truncate table pg_temp.policy_projection_cache;
  insert into pg_temp.policy_projection_cache
  select * from private.recommendation_policy_projection(p_run_id);

  if v_run.kind = 'automatic' then
    select projection.* into v_selected
    from pg_temp.policy_projection_cache as projection
    where projection.rank_position = 1;

    select
      coalesce(jsonb_agg(city.city_code order by city.city_code collate "C"), '[]'::jsonb),
      coalesce(jsonb_agg(city.city_code order by city.rank_position), '[]'::jsonb)
    into v_eligible_city_codes, v_ordered_city_codes
    from pg_temp.policy_projection_cache as city;
  elsif v_run.kind = 'alternative' then
    select projection.* into v_selected
    from pg_temp.policy_projection_cache as projection
    where projection.city_code = v_run.requested_city_code;
  else
    raise exception 'proposal does not match recommendation policy';
  end if;

  if v_selected.city_code is null
    or v_proposal.output_json ->> 'status' is distinct from 'proposal'
    or v_proposal.output_json ->> 'cityCode' is distinct from v_selected.city_code
    or coalesce(jsonb_array_length(v_proposal.output_json -> 'schemes'), 0) <> 2
    or v_proposal.output_json #>> '{schemes,0,kind}' is distinct from 'saving'
    or v_proposal.output_json #>> '{schemes,1,kind}' is distinct from 'fast'
    or v_proposal.output_json #> '{schemes,0,quoteIdsByParticipant}'
      is distinct from v_selected.saving_quote_ids
    or v_proposal.output_json #> '{schemes,1,quoteIdsByParticipant}'
      is distinct from v_selected.fast_quote_ids
    or (v_proposal.output_json #>> '{schemes,0,totalFareCny}')::integer
      is distinct from v_selected.saving_total_fare
    or (v_proposal.output_json #>> '{schemes,1,totalFareCny}')::integer
      is distinct from v_selected.fast_total_fare
    or (
      v_run.kind = 'automatic'
      and (
        v_proposal.output_json #> '{comparisonEvidence,eligibleCityCodes}'
          is distinct from v_eligible_city_codes
        or v_proposal.output_json #> '{comparisonEvidence,orderedCityCodes}'
          is distinct from v_ordered_city_codes
      )
    )
  then
    raise exception 'proposal does not match recommendation policy';
  end if;

  return query
  select
    projection.rank_position,
    projection.city_code,
    projection.saving_total_fare,
    projection.saving_total_duration,
    projection.saving_latest_arrival,
    projection.saving_total_transfers,
    projection.direct_participant_count,
    projection.fare_fairness_gap,
    projection.saving_quote_ids,
    projection.saving_verified_quote_ids,
    projection.fast_total_fare,
    projection.fast_total_duration,
    projection.fast_latest_arrival,
    projection.fast_total_transfers,
    projection.fast_quote_ids,
    projection.fast_verified_quote_ids
  from pg_temp.policy_projection_cache as projection
  where projection.city_code = v_selected.city_code;
end;
$$;

revoke all on function private.assert_recommendation_proposal(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.assert_recommendation_proposal(uuid, uuid)
  to service_role;

create or replace function private.assert_materialized_recommendation_result(
  p_run_id uuid,
  p_proposal_id uuid,
  p_result_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
  v_proposal public.recommendation_proposals%rowtype;
  v_result public.recommendation_results%rowtype;
  v_projection record;
begin
  select * into v_run
  from public.recommendation_runs
  where id = p_run_id;

  select * into v_proposal
  from public.recommendation_proposals
  where id = p_proposal_id
    and run_id = p_run_id;

  select * into v_result
  from public.recommendation_results
  where id = p_result_id
    and run_id = p_run_id
    and proposal_id = p_proposal_id;

  select * into v_projection
  from private.assert_recommendation_proposal(p_run_id, p_proposal_id);

  if v_run.id is null
    or v_proposal.id is null
    or v_result.id is null
    or v_result.plan_id is distinct from v_run.plan_id
    or v_result.city_code is distinct from v_projection.city_code
    or v_result.explanation_zh is distinct from v_proposal.output_json ->> 'explanationZh'
    or v_result.is_shared
    or v_result.published_at is not null
    or v_result.superseded_at is not null
    or v_result.superseded_by_result_id is not null
    or (
      select count(*)
      from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
    ) <> 2
    or (
      select count(distinct scheme.kind)
      from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
    ) <> 2
    or exists (
      select 1
      from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
        and (
          (
            scheme.kind = 'saving'
            and (
              scheme.total_fare_cny is distinct from v_projection.saving_total_fare
              or scheme.total_duration_minutes is distinct from v_projection.saving_total_duration
              or scheme.latest_arrival_at is distinct from v_projection.saving_latest_arrival
              or scheme.team_transfer_count is distinct from v_projection.saving_total_transfers
              or (
                select jsonb_object_agg(
                  route.participant_id::text,
                  route.verified_quote_id::text
                  order by route.participant_id
                )
                from public.recommendation_scheme_routes as route
                where route.scheme_id = scheme.id
              ) is distinct from v_projection.saving_verified_quote_ids
            )
          )
          or
          (
            scheme.kind = 'fast'
            and (
              scheme.total_fare_cny is distinct from v_projection.fast_total_fare
              or scheme.total_duration_minutes is distinct from v_projection.fast_total_duration
              or scheme.latest_arrival_at is distinct from v_projection.fast_latest_arrival
              or scheme.team_transfer_count is distinct from v_projection.fast_total_transfers
              or (
                select jsonb_object_agg(
                  route.participant_id::text,
                  route.verified_quote_id::text
                  order by route.participant_id
                )
                from public.recommendation_scheme_routes as route
                where route.scheme_id = scheme.id
              ) is distinct from v_projection.fast_verified_quote_ids
            )
          )
        )
    )
  then
    raise exception 'existing result tree is incomplete or mismatched';
  end if;
end;
$$;

revoke all on function private.assert_materialized_recommendation_result(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.assert_materialized_recommendation_result(uuid, uuid, uuid)
  to service_role;

create or replace function public.materialize_recommendation_result(
  p_run_id uuid,
  p_proposal_id uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_run public.recommendation_runs%rowtype;
  v_proposal public.recommendation_proposals%rowtype;
  v_existing_result public.recommendation_results%rowtype;
  v_projection record;
  v_result_id uuid := gen_random_uuid();
  v_saving_scheme_id uuid := gen_random_uuid();
  v_fast_scheme_id uuid := gen_random_uuid();
begin
  select run.plan_id into v_plan_id
  from public.recommendation_runs as run
  where run.id = p_run_id;
  if not found then
    raise exception 'run not found';
  end if;

  perform 1
  from public.plans as plan
  where plan.id = v_plan_id
  for update;
  if not found then
    raise exception 'plan not found';
  end if;

  select * into v_run
  from public.recommendation_runs as run
  where run.id = p_run_id
  for update;
  if not found
    or v_run.plan_id is distinct from v_plan_id
    or v_run.status <> 'validating'
  then
    raise exception 'run is not valid for materialization';
  end if;

  select * into v_proposal
  from public.recommendation_proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.run_id = p_run_id
  for update;
  if not found
    or v_proposal.status <> 'approved'
    or v_proposal.policy_version <> v_run.policy_version
    or v_proposal.supervisor_approved_version is distinct from v_proposal.version
    or not (v_proposal.validation_decision @> '{"ok": true}'::jsonb)
  then
    raise exception 'proposal is not approved for this run and policy';
  end if;

  select * into v_projection
  from private.assert_recommendation_proposal(p_run_id, p_proposal_id);
  if not found then
    raise exception 'proposal does not match recommendation policy';
  end if;

  select * into v_existing_result
  from public.recommendation_results as result
  where result.run_id = p_run_id
    and result.proposal_id = p_proposal_id
  for update;
  if found then
    perform private.assert_materialized_recommendation_result(
      p_run_id,
      p_proposal_id,
      v_existing_result.id
    );
    return v_existing_result.id;
  end if;

  insert into public.recommendation_results (
    id,
    plan_id,
    run_id,
    proposal_id,
    city_code,
    explanation_zh,
    is_shared
  )
  values (
    v_result_id,
    v_run.plan_id,
    v_run.id,
    v_proposal.id,
    v_projection.city_code,
    v_proposal.output_json ->> 'explanationZh',
    false
  );

  insert into public.recommendation_schemes (
    id,
    result_id,
    kind,
    total_fare_cny,
    total_duration_minutes,
    latest_arrival_at,
    team_transfer_count
  )
  values
    (
      v_saving_scheme_id,
      v_result_id,
      'saving',
      v_projection.saving_total_fare,
      v_projection.saving_total_duration,
      v_projection.saving_latest_arrival,
      v_projection.saving_total_transfers
    ),
    (
      v_fast_scheme_id,
      v_result_id,
      'fast',
      v_projection.fast_total_fare,
      v_projection.fast_total_duration,
      v_projection.fast_latest_arrival,
      v_projection.fast_total_transfers
    );

  insert into public.recommendation_scheme_routes (
    scheme_id,
    participant_id,
    verified_quote_id
  )
  select
    v_saving_scheme_id,
    selected.participant_id::uuid,
    selected.verified_quote_id::uuid
  from jsonb_each_text(v_projection.saving_verified_quote_ids)
    as selected(participant_id, verified_quote_id)
  union all
  select
    v_fast_scheme_id,
    selected.participant_id::uuid,
    selected.verified_quote_id::uuid
  from jsonb_each_text(v_projection.fast_verified_quote_ids)
    as selected(participant_id, verified_quote_id);

  perform private.assert_materialized_recommendation_result(
    p_run_id,
    p_proposal_id,
    v_result_id
  );
  return v_result_id;
end;
$$;

revoke all on function public.materialize_recommendation_result(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.materialize_recommendation_result(uuid, uuid)
  to service_role;

create or replace function public.publish_shared_result(
  p_run_id uuid,
  p_proposal_id uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_run public.recommendation_runs%rowtype;
  v_proposal public.recommendation_proposals%rowtype;
  v_result public.recommendation_results%rowtype;
begin
  select run.plan_id into v_plan_id
  from public.recommendation_runs as run
  where run.id = p_run_id;
  if not found then
    raise exception 'run not found';
  end if;

  perform 1
  from public.plans as plan
  where plan.id = v_plan_id
  for update;
  if not found then
    raise exception 'plan not found';
  end if;

  select * into v_run
  from public.recommendation_runs as run
  where run.id = p_run_id
  for update;
  if not found or v_run.plan_id is distinct from v_plan_id then
    raise exception 'run not found';
  end if;
  if v_run.kind <> 'automatic' then
    raise exception 'automatic publication requires an automatic run';
  end if;
  if v_run.status <> 'validating' then
    raise exception 'automatic run must be validating';
  end if;

  select * into v_proposal
  from public.recommendation_proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.run_id = p_run_id
  for update;
  if not found
    or v_proposal.status <> 'approved'
    or v_proposal.policy_version <> v_run.policy_version
    or v_proposal.supervisor_approved_version is distinct from v_proposal.version
    or not (v_proposal.validation_decision @> '{"ok": true}'::jsonb)
  then
    raise exception 'proposal is not approved for this run and policy';
  end if;

  select * into v_result
  from public.recommendation_results as result
  where result.run_id = p_run_id
    and result.proposal_id = p_proposal_id
  for update;
  if not found then
    raise exception 'exactly one matching result is required';
  end if;

  if exists (
    select 1
    from public.recommendation_results as current_result
    where current_result.plan_id = v_run.plan_id
      and current_result.is_shared
      and current_result.superseded_at is null
  ) then
    raise exception 'shared result already exists';
  end if;

  perform private.assert_materialized_recommendation_result(
    p_run_id,
    p_proposal_id,
    v_result.id
  );

  update public.recommendation_results
  set is_shared = true,
      published_at = now()
  where id = v_result.id;

  update public.recommendation_runs
  set status = 'completed',
      completed_at = now(),
      retry_after = null,
      stale_after = null,
      advance_lease_token = null,
      advance_lease_expires_at = null
  where id = p_run_id;

  return v_result.id;
end;
$$;

revoke all on function public.publish_shared_result(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.publish_shared_result(uuid, uuid)
  to service_role;

create or replace function public.confirm_alternative_result(
  p_run_id uuid,
  p_proposal_id uuid,
  p_host_token_hash text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_run public.recommendation_runs%rowtype;
  v_proposal public.recommendation_proposals%rowtype;
  v_result public.recommendation_results%rowtype;
  v_current_result_id uuid;
begin
  select run.plan_id into v_plan_id
  from public.recommendation_runs as run
  where run.id = p_run_id;
  if not found then
    raise exception 'run not found';
  end if;

  perform 1
  from public.plans as plan
  where plan.id = v_plan_id
  for update;
  if not found then
    raise exception 'plan not found';
  end if;

  select * into v_run
  from public.recommendation_runs as run
  where run.id = p_run_id
  for update;
  if not found or v_run.plan_id is distinct from v_plan_id then
    raise exception 'run not found';
  end if;
  if v_run.kind <> 'alternative' then
    raise exception 'host confirmation requires an alternative run';
  end if;
  if v_run.status <> 'awaiting_host_confirmation' then
    raise exception 'alternative run must await host confirmation';
  end if;

  if p_host_token_hash is null or not exists (
    select 1
    from public.plan_credentials as credential
    where credential.plan_id = v_run.plan_id
      and credential.host_token_hash = p_host_token_hash
  ) then
    raise exception 'invalid host credential';
  end if;

  if v_run.stale_after is null or v_run.stale_after <= now() then
    update public.recommendation_runs
    set status = 'failed',
        error_summary = 'RUN_STALE_EXPIRED',
        completed_at = now(),
        stale_after = null,
        advance_lease_token = null,
        advance_lease_expires_at = null
    where id = p_run_id
      and status = 'awaiting_host_confirmation';
    return jsonb_build_object(
      'disposition', 'rejected',
      'code', 'PREVIEW_EXPIRED'
    );
  end if;

  select * into v_proposal
  from public.recommendation_proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.run_id = p_run_id
  for update;
  if not found
    or v_proposal.status <> 'approved'
    or v_proposal.policy_version <> v_run.policy_version
    or v_proposal.supervisor_approved_version is distinct from v_proposal.version
    or not (v_proposal.validation_decision @> '{"ok": true}'::jsonb)
  then
    raise exception 'proposal is not approved for this run and policy';
  end if;

  select * into v_result
  from public.recommendation_results as result
  where result.run_id = p_run_id
    and result.proposal_id = p_proposal_id
  for update;
  if not found
    or v_result.plan_id is distinct from v_run.plan_id
    or v_result.city_code is distinct from v_run.requested_city_code
    or v_result.is_shared
  then
    raise exception 'exactly one matching alternative result is required';
  end if;

  select current_result.id into v_current_result_id
  from public.recommendation_results as current_result
  where current_result.plan_id = v_run.plan_id
    and current_result.is_shared
    and current_result.superseded_at is null
  for update;
  if not found then
    raise exception 'no shared result to replace';
  end if;

  perform private.assert_materialized_recommendation_result(
    p_run_id,
    p_proposal_id,
    v_result.id
  );

  update public.recommendation_results
  set superseded_at = now(),
      superseded_by_result_id = v_result.id
  where id = v_current_result_id;

  update public.recommendation_results
  set is_shared = true,
      published_at = now()
  where id = v_result.id;

  update public.recommendation_runs
  set status = 'completed',
      completed_at = now(),
      retry_after = null,
      stale_after = null,
      advance_lease_token = null,
      advance_lease_expires_at = null
  where id = p_run_id;

  return jsonb_build_object(
    'disposition', 'completed',
    'resultId', v_result.id
  );
end;
$$;

revoke all on function public.confirm_alternative_result(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_alternative_result(uuid, uuid, text)
  to service_role;

create table participant_credentials (
  participant_id uuid primary key references participants(id) on delete cascade,
  edit_token_hash text not null,
  created_at timestamptz not null default now()
);

insert into participant_credentials (participant_id, edit_token_hash)
select participants.id, participants.edit_token_hash
from participants;

alter table participants
  drop column edit_token_hash;

create table plan_credentials (
  plan_id uuid primary key references plans(id) on delete cascade,
  host_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop index if exists recommendation_runs_one_running_per_plan;

alter table recommendation_runs
  drop constraint recommendation_runs_status_check;

update recommendation_runs
set
  status = 'incomplete',
  completed_at = coalesce(completed_at, now()),
  error_summary = coalesce(
    nullif(btrim(error_summary), ''),
    'MIGRATED_LEGACY_INCOMPLETE_RUN'
  )
where status in ('running', 'partial');

alter table recommendation_runs
  add column kind text not null default 'automatic'
    check (kind in ('automatic', 'alternative')),
  add column requested_city_code text,
  add column requested_by_participant_id uuid references participants(id) on delete set null,
  add column policy_version text not null default '2026-07-15.v1',
  add column trace_id uuid not null default gen_random_uuid(),
  add column retry_after timestamptz,
  add constraint recommendation_runs_status_check check (
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
  add constraint recommendation_runs_kind_request_check check (
    (kind = 'automatic' and requested_city_code is null and requested_by_participant_id is null)
    or
    (kind = 'alternative' and requested_city_code is not null and requested_by_participant_id is not null)
  );

create unique index recommendation_runs_one_active_per_plan
  on recommendation_runs (plan_id)
  where status in (
    'pending',
    'collecting',
    'cooling_down',
    'calculating',
    'validating',
    'awaiting_host_confirmation'
  );

create table route_tasks (
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

create table verified_quotes (
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

create table agent_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  trace_id uuid not null,
  agent_name text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table recommendation_proposals (
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
  check (
    status <> 'approved'
    or supervisor_approved_version = version
  )
);

create table recommendation_results (
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

create unique index recommendation_results_one_shared_per_plan
  on recommendation_results (plan_id)
  where is_shared and superseded_at is null;

create table recommendation_schemes (
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

create table recommendation_scheme_routes (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references recommendation_schemes(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  verified_quote_id uuid not null references verified_quotes(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (scheme_id, participant_id),
  unique (scheme_id, verified_quote_id)
);

alter table plan_credentials enable row level security;
alter table participant_credentials enable row level security;
alter table route_tasks enable row level security;
alter table verified_quotes enable row level security;
alter table agent_events enable row level security;
alter table recommendation_proposals enable row level security;
alter table recommendation_results enable row level security;
alter table recommendation_schemes enable row level security;
alter table recommendation_scheme_routes enable row level security;

revoke all on table plan_credentials from public, anon, authenticated;
revoke all on table participant_credentials from public, anon, authenticated;
revoke all on table route_tasks from public, anon, authenticated;
revoke all on table verified_quotes from public, anon, authenticated;
revoke all on table agent_events from public, anon, authenticated;
revoke all on table recommendation_proposals from public, anon, authenticated;

create policy "public read shared recommendation results"
  on recommendation_results for select
  using (is_shared);

create policy "public read shared recommendation schemes"
  on recommendation_schemes for select
  using (
    exists (
      select 1
      from recommendation_results
      where recommendation_results.id = recommendation_schemes.result_id
        and recommendation_results.is_shared
    )
  );

create policy "public read shared recommendation scheme routes"
  on recommendation_scheme_routes for select
  using (
    exists (
      select 1
      from recommendation_schemes
      join recommendation_results
        on recommendation_results.id = recommendation_schemes.result_id
      where recommendation_schemes.id = recommendation_scheme_routes.scheme_id
        and recommendation_results.is_shared
    )
  );

create function create_recommendation_run_matrix(
  p_run_id uuid,
  p_plan_id uuid,
  p_arrival_date date,
  p_candidates jsonb,
  p_tasks jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meeting_date date;
begin
  if p_run_id is null
    or p_plan_id is null
    or p_arrival_date is null
    or jsonb_typeof(p_candidates) is distinct from 'array'
    or jsonb_typeof(p_tasks) is distinct from 'array'
    or jsonb_array_length(p_candidates) = 0
    or jsonb_array_length(p_tasks) = 0
  then
    raise exception 'invalid run matrix input';
  end if;

  select public.plans.meeting_date
  into v_meeting_date
  from public.plans
  where public.plans.id = p_plan_id
  for update;
  if not found or v_meeting_date is distinct from p_arrival_date then
    raise exception 'plan arrival date mismatch';
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

  insert into public.recommendation_runs (
    id, plan_id, status, kind
  ) values (
    p_run_id, p_plan_id, 'pending', 'automatic'
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
    'runId', p_run_id,
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

  return true;
end;
$$;

create function publish_shared_result(
  p_run_id uuid,
  p_proposal_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
  v_proposal public.recommendation_proposals%rowtype;
  v_result public.recommendation_results%rowtype;
  v_meeting_date date;
  v_participant_count integer;
begin
  select *
  into v_run
  from public.recommendation_runs
  where public.recommendation_runs.id = p_run_id
  for update;

  if not found then
    raise exception 'run not found';
  end if;
  if v_run.kind <> 'automatic' then
    raise exception 'automatic publication requires an automatic run';
  end if;
  if v_run.status <> 'validating' then
    raise exception 'automatic run must be validating';
  end if;

  select public.plans.meeting_date
  into v_meeting_date
  from public.plans
  where public.plans.id = v_run.plan_id
  for update;

  select *
  into v_proposal
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

  select *
  into v_result
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
    select 1
    from public.recommendation_results
    where public.recommendation_results.plan_id = v_run.plan_id
      and public.recommendation_results.is_shared
      and public.recommendation_results.superseded_at is null
  ) then
    raise exception 'shared result already exists';
  end if;

  select count(*)
  into v_participant_count
  from public.participants
  where public.participants.plan_id = v_run.plan_id;

  if v_participant_count = 0
    or (select count(*) from public.recommendation_schemes where result_id = v_result.id) <> 2
    or (select count(distinct kind) from public.recommendation_schemes where result_id = v_result.id) <> 2
    or exists (
      select 1
      from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
        and (
          select count(*)
          from public.recommendation_scheme_routes as scheme_route
          where scheme_route.scheme_id = scheme.id
        ) <> v_participant_count
    )
    or exists (
      select 1
      from public.recommendation_scheme_routes as scheme_route
      join public.recommendation_schemes as scheme on scheme.id = scheme_route.scheme_id
      left join public.participants as participant
        on participant.id = scheme_route.participant_id
        and participant.plan_id = v_run.plan_id
      left join public.verified_quotes as quote
        on quote.id = scheme_route.verified_quote_id
      where scheme.result_id = v_result.id
        and (
          participant.id is null
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
          ]
        )
    )
    or exists (
      select 1
      from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
        and (
          (
            select count(*)
            from jsonb_object_keys(
              v_proposal.output_json -> 'schemes'
                -> (case when scheme.kind = 'saving' then 0 else 1 end)
                -> 'quoteIdsByParticipant'
            )
          ) <> v_participant_count
          or scheme.total_fare_cny is distinct from (
            v_proposal.output_json #>> array[
              'schemes',
              case when scheme.kind = 'saving' then '0' else '1' end,
              'totalFareCny'
            ]
          )::integer
          or
          scheme.total_fare_cny <> (
            select coalesce(sum(quote.price_cny), 0)
            from public.recommendation_scheme_routes as scheme_route
            join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
            where scheme_route.scheme_id = scheme.id
          )
          or scheme.total_duration_minutes <> (
            select coalesce(sum(quote.duration_minutes), 0)
            from public.recommendation_scheme_routes as scheme_route
            join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
            where scheme_route.scheme_id = scheme.id
          )
        )
    )
  then
    raise exception 'result evidence or participant coverage is invalid';
  end if;

  update public.recommendation_results
  set is_shared = true, published_at = now()
  where public.recommendation_results.id = v_result.id;

  update public.recommendation_runs
  set status = 'completed', completed_at = now(), retry_after = null
  where public.recommendation_runs.id = p_run_id;

  return v_result.id;
end;
$$;

create function confirm_alternative_result(
  p_run_id uuid,
  p_proposal_id uuid,
  p_host_token_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
  v_proposal public.recommendation_proposals%rowtype;
  v_result public.recommendation_results%rowtype;
  v_current_result_id uuid;
  v_meeting_date date;
  v_participant_count integer;
begin
  select *
  into v_run
  from public.recommendation_runs
  where public.recommendation_runs.id = p_run_id
  for update;

  if not found then
    raise exception 'run not found';
  end if;
  if v_run.kind <> 'alternative' then
    raise exception 'host confirmation requires an alternative run';
  end if;
  if v_run.status <> 'awaiting_host_confirmation' then
    raise exception 'alternative run must await host confirmation';
  end if;

  select public.plans.meeting_date
  into v_meeting_date
  from public.plans
  where public.plans.id = v_run.plan_id
  for update;

  if p_host_token_hash is null or not exists (
    select 1
    from public.plan_credentials
    where public.plan_credentials.plan_id = v_run.plan_id
      and public.plan_credentials.host_token_hash = p_host_token_hash
  ) then
    raise exception 'invalid host credential';
  end if;

  select *
  into v_proposal
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

  select *
  into v_result
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

  select public.recommendation_results.id
  into v_current_result_id
  from public.recommendation_results
  where public.recommendation_results.plan_id = v_run.plan_id
    and public.recommendation_results.is_shared
    and public.recommendation_results.superseded_at is null
  for update;

  if not found then
    raise exception 'no shared result to replace';
  end if;

  select count(*)
  into v_participant_count
  from public.participants
  where public.participants.plan_id = v_run.plan_id;

  if v_participant_count = 0
    or (select count(*) from public.recommendation_schemes where result_id = v_result.id) <> 2
    or (select count(distinct kind) from public.recommendation_schemes where result_id = v_result.id) <> 2
    or exists (
      select 1
      from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
        and (
          select count(*)
          from public.recommendation_scheme_routes as scheme_route
          where scheme_route.scheme_id = scheme.id
        ) <> v_participant_count
    )
    or exists (
      select 1
      from public.recommendation_scheme_routes as scheme_route
      join public.recommendation_schemes as scheme on scheme.id = scheme_route.scheme_id
      left join public.participants as participant
        on participant.id = scheme_route.participant_id
        and participant.plan_id = v_run.plan_id
      left join public.verified_quotes as quote
        on quote.id = scheme_route.verified_quote_id
      where scheme.result_id = v_result.id
        and (
          participant.id is null
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
          ]
        )
    )
    or exists (
      select 1
      from public.recommendation_schemes as scheme
      where scheme.result_id = v_result.id
        and (
          (
            select count(*)
            from jsonb_object_keys(
              v_proposal.output_json -> 'schemes'
                -> (case when scheme.kind = 'saving' then 0 else 1 end)
                -> 'quoteIdsByParticipant'
            )
          ) <> v_participant_count
          or scheme.total_fare_cny is distinct from (
            v_proposal.output_json #>> array[
              'schemes',
              case when scheme.kind = 'saving' then '0' else '1' end,
              'totalFareCny'
            ]
          )::integer
          or
          scheme.total_fare_cny <> (
            select coalesce(sum(quote.price_cny), 0)
            from public.recommendation_scheme_routes as scheme_route
            join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
            where scheme_route.scheme_id = scheme.id
          )
          or scheme.total_duration_minutes <> (
            select coalesce(sum(quote.duration_minutes), 0)
            from public.recommendation_scheme_routes as scheme_route
            join public.verified_quotes as quote on quote.id = scheme_route.verified_quote_id
            where scheme_route.scheme_id = scheme.id
          )
        )
    )
  then
    raise exception 'result evidence or participant coverage is invalid';
  end if;

  update public.recommendation_results
  set
    superseded_at = now(),
    superseded_by_result_id = v_result.id
  where public.recommendation_results.id = v_current_result_id;

  update public.recommendation_results
  set is_shared = true, published_at = now()
  where public.recommendation_results.id = v_result.id;

  update public.recommendation_runs
  set status = 'completed', completed_at = now(), retry_after = null
  where public.recommendation_runs.id = p_run_id;

  return v_result.id;
end;
$$;

revoke execute on function create_recommendation_run_matrix(uuid, uuid, date, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function save_route_task_outcome(uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function publish_shared_result(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function confirm_alternative_result(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function create_recommendation_run_matrix(uuid, uuid, date, jsonb, jsonb)
  to service_role;
grant execute on function save_route_task_outcome(uuid, jsonb, jsonb)
  to service_role;
grant execute on function publish_shared_result(uuid, uuid)
  to service_role;
grant execute on function confirm_alternative_result(uuid, uuid, text)
  to service_role;

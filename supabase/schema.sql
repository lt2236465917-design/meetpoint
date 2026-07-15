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
  policy_version text not null default '2026-07-15.v1',
  trace_id uuid not null default gen_random_uuid(),
  retry_after timestamptz,
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
  unique (run_id, physical_key)
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

create policy "public read plan by code" on plans for select using (true);
create policy "public read participants" on participants for select using (true);
create policy "public read candidate cities" on candidate_cities for select using (true);
create policy "public read runs" on recommendation_runs for select using (true);
create policy "public read travel options" on travel_options for select using (true);
create policy "public read city recommendations" on city_recommendations for select using (true);
create policy "public read shared recommendation results"
  on recommendation_results for select using (is_shared);
create policy "public read shared recommendation schemes"
  on recommendation_schemes for select
  using (
    exists (
      select 1 from recommendation_results
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

revoke all on table plan_credentials from public, anon, authenticated;
revoke all on table participant_credentials from public, anon, authenticated;
revoke all on table route_tasks from public, anon, authenticated;
revoke all on table verified_quotes from public, anon, authenticated;
revoke all on table agent_events from public, anon, authenticated;
revoke all on table recommendation_proposals from public, anon, authenticated;

alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table candidate_cities;
alter publication supabase_realtime add table recommendation_runs;
alter publication supabase_realtime add table city_recommendations;

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
  v_meeting_date date;
  v_participant_count integer;
begin
  select * into v_run
  from public.recommendation_runs
  where public.recommendation_runs.id = p_run_id
  for update;
  if not found then raise exception 'run not found'; end if;
  if v_run.kind <> 'automatic' then
    raise exception 'automatic publication requires an automatic run';
  end if;
  if v_run.status <> 'validating' then
    raise exception 'automatic run must be validating';
  end if;

  select public.plans.meeting_date into v_meeting_date
  from public.plans
  where public.plans.id = v_run.plan_id
  for update;

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
  select * into v_run
  from public.recommendation_runs
  where public.recommendation_runs.id = p_run_id
  for update;
  if not found then raise exception 'run not found'; end if;
  if v_run.kind <> 'alternative' then
    raise exception 'host confirmation requires an alternative run';
  end if;
  if v_run.status <> 'awaiting_host_confirmation' then
    raise exception 'alternative run must await host confirmation';
  end if;

  select public.plans.meeting_date into v_meeting_date
  from public.plans
  where public.plans.id = v_run.plan_id
  for update;
  if p_host_token_hash is null or not exists (
    select 1 from public.plan_credentials
    where public.plan_credentials.plan_id = v_run.plan_id
      and public.plan_credentials.host_token_hash = p_host_token_hash
  ) then
    raise exception 'invalid host credential';
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
  set status = 'completed', completed_at = now(), retry_after = null
  where public.recommendation_runs.id = p_run_id;
  return v_result.id;
end;
$$;

revoke execute on function publish_shared_result(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function confirm_alternative_result(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function publish_shared_result(uuid, uuid) to service_role;
grant execute on function confirm_alternative_result(uuid, uuid, text) to service_role;

begin;

drop policy if exists "public read plan by code" on public.plans;
drop policy if exists "public read participants" on public.participants;
drop policy if exists "public read candidate cities" on public.candidate_cities;
drop policy if exists "public read runs" on public.recommendation_runs;
drop policy if exists "public read travel options" on public.travel_options;
drop policy if exists "public read city recommendations" on public.city_recommendations;
drop policy if exists "public read shared recommendation results" on public.recommendation_results;
drop policy if exists "public read shared recommendation schemes" on public.recommendation_schemes;
drop policy if exists "public read shared recommendation scheme routes" on public.recommendation_scheme_routes;

alter table public.plans enable row level security;
alter table public.participants enable row level security;
alter table public.candidate_cities enable row level security;
alter table public.recommendation_runs enable row level security;
alter table public.travel_options enable row level security;
alter table public.city_recommendations enable row level security;
alter table public.ai_explanations enable row level security;
alter table public.plan_credentials enable row level security;
alter table public.participant_credentials enable row level security;
alter table public.route_tasks enable row level security;
alter table public.verified_quotes enable row level security;
alter table public.agent_events enable row level security;
alter table public.recommendation_proposals enable row level security;
alter table public.recommendation_results enable row level security;
alter table public.recommendation_schemes enable row level security;
alter table public.recommendation_scheme_routes enable row level security;

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

create or replace function create_recommendation_run_matrix(
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
    p_requested_by_participant_id, now() + interval '15 minutes'
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

update public.recommendation_runs
set stale_after = started_at + case
  when status = 'awaiting_host_confirmation' then interval '7 days'
  else interval '15 minutes'
end
where status in (
  'pending', 'collecting', 'cooling_down', 'calculating',
  'validating', 'awaiting_host_confirmation'
)
and stale_after is null;

create unique index if not exists recommendation_runs_one_active_per_plan
  on public.recommendation_runs (plan_id)
  where status in (
    'pending', 'collecting', 'cooling_down', 'calculating',
    'validating', 'awaiting_host_confirmation'
  );

revoke execute on function create_plan_with_host_credential(
  text, text, date, integer, text
) from public, anon, authenticated;
revoke execute on function create_participant_with_credential(
  text, text, text, text, text[], text
) from public, anon, authenticated;
revoke execute on function create_recommendation_run_matrix(
  uuid, uuid, date, jsonb, jsonb, text, text, uuid
) from public, anon, authenticated;
revoke execute on function save_route_task_outcome(uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function publish_shared_result(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function confirm_alternative_result(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function create_plan_with_host_credential(
  text, text, date, integer, text
) to service_role;
grant execute on function create_participant_with_credential(
  text, text, text, text, text[], text
) to service_role;
grant execute on function create_recommendation_run_matrix(
  uuid, uuid, date, jsonb, jsonb, text, text, uuid
) to service_role;
grant execute on function save_route_task_outcome(uuid, jsonb, jsonb)
  to service_role;
grant execute on function publish_shared_result(uuid, uuid) to service_role;
grant execute on function confirm_alternative_result(uuid, uuid, text)
  to service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'participants',
    'candidate_cities',
    'recommendation_runs',
    'city_recommendations'
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format(
        'alter publication supabase_realtime drop table public.%I',
        v_table
      );
    end if;
  end loop;
end;
$$;

commit;

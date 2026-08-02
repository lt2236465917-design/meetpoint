alter table public.participants
  add column if not exists departure_lat double precision,
  add column if not exists departure_lng double precision;

alter table public.participants
  add constraint participants_departure_lat_valid
    check (departure_lat is null or departure_lat between -90 and 90),
  add constraint participants_departure_lng_valid
    check (departure_lng is null or departure_lng between -180 and 180);

alter table public.recommendation_runs
  add column if not exists baseline_city_code text,
  add column if not exists baseline_city_name text,
  add column if not exists baseline_policy_version text,
  add column if not exists baseline_evidence_level text,
  add column if not exists baseline_input_fingerprint text;

alter table public.route_tasks
  add column if not exists query_priority integer;
alter table public.route_tasks
  add constraint route_tasks_query_priority_valid
    check (query_priority is null or query_priority >= 0);

alter table public.recommendation_runs
  add constraint recommendation_runs_baseline_complete check (
    (baseline_city_code is null and baseline_city_name is null
      and baseline_policy_version is null and baseline_evidence_level is null
      and baseline_input_fingerprint is null)
    or
    (kind = 'automatic' and baseline_city_code is not null and baseline_city_name is not null
      and baseline_policy_version = '2026-08-01.baseline.v1'
      and baseline_evidence_level = 'canonical_coordinates_and_hubs'
      and baseline_input_fingerprint ~ '^[0-9a-f]{64}$')
  );

drop function if exists public.create_participant_with_credential(
  text, text, text, text, text[], text
);

create function public.create_participant_with_credential(
  p_code text,
  p_name text,
  p_departure_city_code text,
  p_departure_city_name text,
  p_departure_lat double precision,
  p_departure_lng double precision,
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
  if p_departure_lat is null or p_departure_lat not between -90 and 90
    or p_departure_lng is null or p_departure_lng not between -180 and 180 then
    raise exception using errcode = 'P0001', message = 'INVALID_DEPARTURE_COORDINATES';
  end if;

  select public.plans.id, public.plans.participant_limit
  into v_plan_id, v_participant_limit
  from public.plans
  where public.plans.code = p_code
  for update;

  if v_plan_id is null then
    raise exception using errcode = 'P0001', message = 'PLAN_NOT_FOUND';
  end if;

  select count(*) into v_participant_count
  from public.participants
  where public.participants.plan_id = v_plan_id;

  if v_participant_count >= v_participant_limit then
    raise exception using errcode = 'P0001', message = 'PARTICIPANT_LIMIT_REACHED';
  end if;

  insert into public.participants (
    plan_id, name, departure_city_code, departure_city_name,
    departure_lat, departure_lng, accepted_modes, created_by_host
  ) values (
    v_plan_id, p_name, p_departure_city_code, p_departure_city_name,
    p_departure_lat, p_departure_lng, p_accepted_modes, false
  ) returning id into v_participant_id;

  insert into public.participant_credentials (participant_id, edit_token_hash)
  values (v_participant_id, p_edit_token_hash);

  return v_participant_id;
end;
$$;

create function public.ensure_run_baseline(
  p_run_id uuid,
  p_city_code text,
  p_city_name text,
  p_policy_version text,
  p_evidence_level text,
  p_input_fingerprint text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.recommendation_runs%rowtype;
begin
  select * into v_run
  from public.recommendation_runs
  where id = p_run_id
  for update;

  if v_run.id is null or v_run.kind <> 'automatic'
    or p_city_code is null or btrim(p_city_code) = ''
    or p_city_name is null or btrim(p_city_name) = ''
    or p_policy_version <> '2026-08-01.baseline.v1'
    or p_evidence_level <> 'canonical_coordinates_and_hubs'
    or p_input_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_BASELINE_RECOMMENDATION';
  end if;

  if v_run.baseline_city_code is not null and (
    v_run.baseline_city_code <> p_city_code
    or v_run.baseline_city_name <> p_city_name
    or v_run.baseline_policy_version <> p_policy_version
    or v_run.baseline_evidence_level <> p_evidence_level
    or v_run.baseline_input_fingerprint <> p_input_fingerprint
  ) then
    raise exception using errcode = 'P0001', message = 'BASELINE_RECOMMENDATION_MISMATCH';
  end if;

  update public.recommendation_runs set
    baseline_city_code = p_city_code,
    baseline_city_name = p_city_name,
    baseline_policy_version = p_policy_version,
    baseline_evidence_level = p_evidence_level,
    baseline_input_fingerprint = p_input_fingerprint
  where id = p_run_id;
end;
$$;

revoke execute on function public.create_participant_with_credential(
  text, text, text, text, double precision, double precision, text[], text
) from public, anon, authenticated;
grant execute on function public.create_participant_with_credential(
  text, text, text, text, double precision, double precision, text[], text
) to service_role;
revoke execute on function public.ensure_run_baseline(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.ensure_run_baseline(uuid, text, text, text, text, text)
  to service_role;

create function public.ensure_run_task_priorities(p_run_id uuid, p_priorities jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task_count integer;
begin
  if jsonb_typeof(p_priorities) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_ROUTE_TASK_PRIORITIES';
  end if;
  select count(*) into v_task_count from public.route_tasks where run_id = p_run_id;
  if v_task_count = 0 or jsonb_array_length(p_priorities) <> v_task_count
    or (select count(distinct priority) from jsonb_to_recordset(p_priorities)
        as item(participant_id uuid, city_code text, mode text, search_date date, priority integer)) <> v_task_count
    or exists (
      select 1
      from jsonb_to_recordset(p_priorities)
        as item(participant_id uuid, city_code text, mode text, search_date date, priority integer)
      left join public.route_tasks task
        on task.run_id = p_run_id and task.participant_id = item.participant_id
        and task.city_code = item.city_code and task.mode = item.mode
        and task.search_date = item.search_date
      where task.id is null or item.priority < 0 or item.priority >= v_task_count
    ) then
    raise exception using errcode = 'P0001', message = 'INVALID_ROUTE_TASK_PRIORITIES';
  end if;

  update public.route_tasks task set query_priority = item.priority
  from jsonb_to_recordset(p_priorities)
    as item(participant_id uuid, city_code text, mode text, search_date date, priority integer)
  where task.run_id = p_run_id and task.participant_id = item.participant_id
    and task.city_code = item.city_code and task.mode = item.mode
    and task.search_date = item.search_date;
end;
$$;

revoke execute on function public.ensure_run_task_priorities(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.ensure_run_task_priorities(uuid, jsonb)
  to service_role;

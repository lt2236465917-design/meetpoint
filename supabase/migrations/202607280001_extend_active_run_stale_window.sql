-- Extend active-run inactivity window from 15 minutes to 2 hours.
-- Matches ACTIVE_RUN_STALE_MS in src/lib/recommendation/run-deadlines.ts.

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

create or replace function save_route_task_outcome(
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

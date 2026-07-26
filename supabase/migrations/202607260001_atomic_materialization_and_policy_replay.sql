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

alter table public.plans
  drop column if exists target_arrival_time;


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

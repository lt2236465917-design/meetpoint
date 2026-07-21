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

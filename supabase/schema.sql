create extension if not exists pgcrypto;

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  meeting_date date not null,
  target_arrival_time text not null,
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
  edit_token_hash text not null,
  created_by_host boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  stale_after timestamptz,
  error_summary text
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

alter table plans enable row level security;
alter table participants enable row level security;
alter table candidate_cities enable row level security;
alter table recommendation_runs enable row level security;
alter table travel_options enable row level security;
alter table city_recommendations enable row level security;
alter table ai_explanations enable row level security;

create policy "public read plan by code" on plans for select using (true);
create policy "public read participants" on participants for select using (true);
create policy "public read candidate cities" on candidate_cities for select using (true);
create policy "public read runs" on recommendation_runs for select using (true);
create policy "public read travel options" on travel_options for select using (true);
create policy "public read city recommendations" on city_recommendations for select using (true);

alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table candidate_cities;
alter publication supabase_realtime add table recommendation_runs;
alter publication supabase_realtime add table city_recommendations;

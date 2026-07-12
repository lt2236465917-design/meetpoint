alter table travel_options
  add column if not exists queried_at timestamptz;

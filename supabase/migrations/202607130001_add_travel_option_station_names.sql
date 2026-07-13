alter table travel_options
  add column if not exists departure_station_name text,
  add column if not exists arrival_station_name text;

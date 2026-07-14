create unique index if not exists recommendation_runs_one_running_per_plan
  on recommendation_runs (plan_id)
  where status = 'running';

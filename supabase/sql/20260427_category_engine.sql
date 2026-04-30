create table if not exists public.category_engine_settings_1d6e33e0 (
  id text primary key,
  enabled boolean not null default true,
  batch_size integer not null default 25,
  max_concurrency integer not null default 3,
  retry_limit integer not null default 5,
  fallback_root_category_id text not null default '-500',
  cron_enabled boolean not null default true,
  watermark_low integer not null default 150,
  watermark_target integer not null default 500,
  updated_at timestamptz not null default now()
);

insert into public.category_engine_settings_1d6e33e0 (
  id,
  enabled,
  batch_size,
  max_concurrency,
  retry_limit,
  fallback_root_category_id,
  cron_enabled,
  watermark_low,
  watermark_target
)
values (
  'default',
  true,
  25,
  3,
  5,
  '-500',
  true,
  150,
  500
)
on conflict (id) do nothing;

create table if not exists public.category_engine_runs_1d6e33e0 (
  run_id text primary key,
  status text not null check (status in ('queued', 'running', 'paused', 'completed', 'completed_with_errors', 'failed', 'canceled')),
  mode text not null default 'continuous' check (mode in ('continuous')),
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  completed_at timestamptz,
  discovered_count integer not null default 0,
  processed_count integer not null default 0,
  applied_count integer not null default 0,
  retry_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  low_confidence_auto_applied_count integer not null default 0,
  current_sku text,
  source_summary jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_category_engine_active_run_1d6e33e0
  on public.category_engine_runs_1d6e33e0 ((1))
  where status in ('queued', 'running', 'paused');

create index if not exists idx_category_engine_runs_status_started_1d6e33e0
  on public.category_engine_runs_1d6e33e0 (status, started_at desc);

create table if not exists public.category_engine_items_1d6e33e0 (
  run_id text not null references public.category_engine_runs_1d6e33e0(run_id) on delete cascade,
  sku text not null,
  status text not null check (status in ('pending', 'analyzing', 'suggested', 'applied', 'retry_wait', 'failed', 'skipped')),
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  current_category_ids text[] not null default '{}',
  suggested_category_id text,
  suggested_category_path text,
  confidence numeric(6,4),
  decision_source text check (decision_source in ('toyota', 'regra', 'similaridade', 'ia_forced_choice', 'fallback_root')),
  review_flag boolean not null default false,
  payload_json jsonb not null default '{}'::jsonb,
  last_error text,
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (run_id, sku)
);

create index if not exists idx_category_engine_items_run_status_updated_1d6e33e0
  on public.category_engine_items_1d6e33e0 (run_id, status, updated_at desc);

create index if not exists idx_category_engine_items_run_retry_1d6e33e0
  on public.category_engine_items_1d6e33e0 (run_id, next_retry_at asc)
  where status = 'retry_wait';

create index if not exists idx_category_engine_items_run_review_1d6e33e0
  on public.category_engine_items_1d6e33e0 (run_id, review_flag, updated_at desc);

create index if not exists idx_category_engine_items_sku_1d6e33e0
  on public.category_engine_items_1d6e33e0 (sku);

create table if not exists public.category_engine_logs_1d6e33e0 (
  id bigint generated always as identity primary key,
  run_id text not null references public.category_engine_runs_1d6e33e0(run_id) on delete cascade,
  sku text,
  level text not null check (level in ('info', 'warning', 'error', 'success')),
  stage text not null check (stage in ('discover', 'analyze', 'decide', 'apply', 'retry', 'complete')),
  message text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_category_engine_logs_run_created_1d6e33e0
  on public.category_engine_logs_1d6e33e0 (run_id, created_at desc, id desc);

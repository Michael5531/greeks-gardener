create table if not exists public.iv_history (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  snapshot_date date not null,
  iv30 numeric,
  hv30 numeric,
  rr25 numeric,
  fly25 numeric,
  spot numeric,
  created_at timestamptz not null default now(),
  unique (ticker, snapshot_date)
);

create index if not exists iv_history_ticker_date_idx
  on public.iv_history (ticker, snapshot_date desc);

alter table public.iv_history enable row level security;

create policy "iv_history read for authenticated"
  on public.iv_history for select
  to authenticated
  using (true);

create policy "iv_history service write"
  on public.iv_history for all
  to service_role
  using (true)
  with check (true);
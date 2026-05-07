create table public.compute_cache (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  cache_key text not null,
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  fresh_until timestamptz not null,
  unique (kind, cache_key)
);
create index compute_cache_kind_key_idx on public.compute_cache (kind, cache_key);
create index compute_cache_fresh_until_idx on public.compute_cache (fresh_until);

alter table public.compute_cache enable row level security;

create policy "authenticated read cache"
  on public.compute_cache for select
  to authenticated
  using (true);

create policy "service role manages cache"
  on public.compute_cache for all
  to service_role
  using (true)
  with check (true);
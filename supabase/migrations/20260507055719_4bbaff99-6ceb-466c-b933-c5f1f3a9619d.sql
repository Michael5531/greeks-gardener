
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- watchlist
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique(user_id, ticker)
);
alter table public.watchlist enable row level security;
create policy "watchlist_all_own" on public.watchlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- strategies
create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  strategy_type text not null,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.strategies enable row level security;
create policy "strategies_all_own" on public.strategies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- backtests
create table public.backtests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid references public.strategies(id) on delete set null,
  ticker text not null,
  start_date date not null,
  end_date date not null,
  params jsonb not null default '{}'::jsonb,
  metrics jsonb,
  equity_curve jsonb,
  trades jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.backtests enable row level security;
create policy "backtests_all_own" on public.backtests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- signals
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  strategy_type text not null,
  signal jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.signals enable row level security;
create policy "signals_all_own" on public.signals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

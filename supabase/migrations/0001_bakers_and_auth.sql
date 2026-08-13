-- Phase 2: Auth & business ownership
-- One `bakers` row per auth.users account, created automatically on signup.
-- RLS from day one: a baker can only ever see/write their own row.

create table public.bakers (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text,
  currency text not null default 'PHP',
  timezone text not null default 'Asia/Manila',
  default_margin_percent numeric not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bakers enable row level security;

create policy "Bakers can select their own row"
  on public.bakers for select
  using (id = auth.uid());

create policy "Bakers can insert their own row"
  on public.bakers for insert
  with check (id = auth.uid());

create policy "Bakers can update their own row"
  on public.bakers for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Bakers can delete their own row"
  on public.bakers for delete
  using (id = auth.uid());

-- Keep updated_at accurate on every update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bakers_set_updated_at
  before update on public.bakers
  for each row
  execute function public.set_updated_at();

-- Auto-create an (empty) bakers row the moment someone signs up, so a
-- session is never authenticated without a matching baker profile to
-- attach data to. business_name stays null until onboarding fills it in;
-- the app treats "business_name is null" as "needs onboarding".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.bakers (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

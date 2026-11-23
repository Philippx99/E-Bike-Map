-- Im Supabase-Dashboard unter "SQL Editor" einmal ausführen.

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  type text not null check (type in ('ebike','emofa')),
  range_km numeric not null check (range_km > 0),
  created_at timestamptz not null default now()
);

create table charge_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

alter table vehicles enable row level security;
alter table charge_points enable row level security;

-- Fahrzeuge: nur eigene
create policy "vehicles own" on vehicles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Ladepunkte: eigene + öffentliche lesen, nur eigene ändern
create policy "charge read" on charge_points for select to authenticated
  using (is_public or user_id = auth.uid());
create policy "charge insert" on charge_points for insert to authenticated
  with check (user_id = auth.uid());
create policy "charge update" on charge_points for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "charge delete" on charge_points for delete to authenticated
  using (user_id = auth.uid());

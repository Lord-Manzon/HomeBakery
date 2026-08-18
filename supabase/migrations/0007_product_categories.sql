-- Stores the baker's own set of product categories, each with a chosen
-- icon — see docs/DECISIONS.md's 2026-08-18 "Product category icons"
-- entry. products.category stays a plain text column (unchanged, see
-- 0005_product_category.sql); this table is looked up by matching
-- name, not referenced via a foreign key, so existing free-typed
-- category values on products keep working even if no matching row
-- here exists yet (they just fall back to a default icon in the app).
--
-- Color is intentionally NOT a column here — it's derived in the app
-- from a hash of the category name into the existing 6 curated accent
-- swatches (src/theme/accentSwatches.ts), so the same name always gets
-- the same color without persisting anything extra, consistent with
-- the 2026-08-15 "curated colors only" decision for Appearance.

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  baker_id uuid not null references public.bakers(id) on delete cascade,
  name text not null,
  icon text not null,
  created_at timestamptz not null default now(),
  unique (baker_id, name)
);

alter table public.product_categories enable row level security;

create policy "select_own_product_categories"
  on public.product_categories for select
  using (baker_id = auth.uid());

create policy "insert_own_product_categories"
  on public.product_categories for insert
  with check (baker_id = auth.uid());

create policy "update_own_product_categories"
  on public.product_categories for update
  using (baker_id = auth.uid());

create policy "delete_own_product_categories"
  on public.product_categories for delete
  using (baker_id = auth.uid());

-- MANUAL STEP REQUIRED, not something this SQL file can do:
-- per docs/DECISIONS.md's 2026-08-15 entry, "Automatically expose new
-- tables" is OFF for this project. After running this migration, go to
-- Supabase Dashboard → Project Settings → API → Exposed tables, and
-- add "product_categories" to the list. The app will get 404/permission
-- errors calling this table until that step is done.
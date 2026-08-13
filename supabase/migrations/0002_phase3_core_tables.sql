-- Phase 3: Database & security foundation
-- Creates every remaining core table from docs/DATABASE.md, each with RLS
-- enabled from the moment it exists. No app code depends on these tables
-- yet — Phase 4 onward will build UI/services against what's created here.
--
-- Table creation order follows foreign-key dependencies:
--   ingredients, recipes  →  recipe_ingredients
--   products              →  product_variants (also needs recipes)
--   orders                →  order_items (also needs products, product_variants)
--   ingredients           →  inventory_movements
--   bakers                →  expenses, storefront_settings, subscriptions

-- =========================================================================
-- ingredients
-- =========================================================================
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  baker_id uuid not null references public.bakers (id) on delete cascade,
  name text not null,
  unit text not null,
  current_stock numeric not null default 0,
  cost_per_unit numeric not null default 0,
  low_stock_threshold numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ingredients_baker_id_idx on public.ingredients (baker_id);

alter table public.ingredients enable row level security;

create policy "Bakers can select their own ingredients"
  on public.ingredients for select
  using (baker_id = auth.uid());

create policy "Bakers can insert their own ingredients"
  on public.ingredients for insert
  with check (baker_id = auth.uid());

create policy "Bakers can update their own ingredients"
  on public.ingredients for update
  using (baker_id = auth.uid())
  with check (baker_id = auth.uid());

create policy "Bakers can delete their own ingredients"
  on public.ingredients for delete
  using (baker_id = auth.uid());

create trigger ingredients_set_updated_at
  before update on public.ingredients
  for each row
  execute function public.set_updated_at();


-- =========================================================================
-- recipes
-- Independent of any product — a variant references a recipe, not the
-- other way around, so one recipe can be reused across products.
-- =========================================================================
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  baker_id uuid not null references public.bakers (id) on delete cascade,
  name text not null,
  yield_quantity numeric not null,
  yield_unit text not null,
  instructions text,
  margin_percent numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_baker_id_idx on public.recipes (baker_id);

alter table public.recipes enable row level security;

create policy "Bakers can select their own recipes"
  on public.recipes for select
  using (baker_id = auth.uid());

create policy "Bakers can insert their own recipes"
  on public.recipes for insert
  with check (baker_id = auth.uid());

create policy "Bakers can update their own recipes"
  on public.recipes for update
  using (baker_id = auth.uid())
  with check (baker_id = auth.uid());

create policy "Bakers can delete their own recipes"
  on public.recipes for delete
  using (baker_id = auth.uid());

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row
  execute function public.set_updated_at();


-- =========================================================================
-- recipe_ingredients (join table: what a recipe needs)
-- No baker_id column — ownership is checked by joining up to `recipes`,
-- same reasoning as product_variants below: avoids a second copy of
-- ownership that could drift from the parent's.
-- =========================================================================
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity numeric not null,
  unit text not null
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id);
create index recipe_ingredients_ingredient_id_idx on public.recipe_ingredients (ingredient_id);

alter table public.recipe_ingredients enable row level security;

create policy "Bakers can select their own recipe ingredients"
  on public.recipe_ingredients for select
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
      and r.baker_id = auth.uid()
    )
  );

create policy "Bakers can insert their own recipe ingredients"
  on public.recipe_ingredients for insert
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
      and r.baker_id = auth.uid()
    )
  );

create policy "Bakers can update their own recipe ingredients"
  on public.recipe_ingredients for update
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
      and r.baker_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
      and r.baker_id = auth.uid()
    )
  );

create policy "Bakers can delete their own recipe ingredients"
  on public.recipe_ingredients for delete
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
      and r.baker_id = auth.uid()
    )
  );


-- =========================================================================
-- products
-- =========================================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  baker_id uuid not null references public.bakers (id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  margin_percent numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_baker_id_idx on public.products (baker_id);

alter table public.products enable row level security;

create policy "Bakers can select their own products"
  on public.products for select
  using (baker_id = auth.uid());

create policy "Bakers can insert their own products"
  on public.products for insert
  with check (baker_id = auth.uid());

create policy "Bakers can update their own products"
  on public.products for update
  using (baker_id = auth.uid())
  with check (baker_id = auth.uid());

create policy "Bakers can delete their own products"
  on public.products for delete
  using (baker_id = auth.uid());

create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();


-- =========================================================================
-- product_variants
-- Price, recipe consumption, and packaging live here, not on the product,
-- since two variants of the same product can differ in all three.
-- No baker_id column — ownership checked by joining up to `products`.
-- =========================================================================
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  recipe_id uuid references public.recipes (id) on delete set null,
  name text not null,
  recipe_portion numeric,
  packaging_cost numeric not null default 0,
  margin_percent numeric,
  selling_price numeric not null,
  suggested_price numeric,
  is_default boolean not null default false,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_variants_product_id_idx on public.product_variants (product_id);
create index product_variants_recipe_id_idx on public.product_variants (recipe_id);

alter table public.product_variants enable row level security;

create policy "Bakers can select their own product variants"
  on public.product_variants for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
      and p.baker_id = auth.uid()
    )
  );

create policy "Bakers can insert their own product variants"
  on public.product_variants for insert
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
      and p.baker_id = auth.uid()
    )
  );

create policy "Bakers can update their own product variants"
  on public.product_variants for update
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
      and p.baker_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
      and p.baker_id = auth.uid()
    )
  );

create policy "Bakers can delete their own product variants"
  on public.product_variants for delete
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
      and p.baker_id = auth.uid()
    )
  );

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row
  execute function public.set_updated_at();


-- =========================================================================
-- orders
-- =========================================================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  baker_id uuid not null references public.bakers (id) on delete cascade,
  customer_name text not null,
  customer_contact text,
  order_source text not null default 'manual'
    check (order_source in ('manual', 'storefront')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid')),
  payment_method text
    check (payment_method in ('gcash', 'cash', 'bank_transfer')),
  fulfillment_type text not null
    check (fulfillment_type in ('pickup', 'delivery')),
  delivery_address text,
  delivery_fee numeric not null default 0,
  scheduled_date date not null,
  scheduled_time time,
  notes text,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_baker_id_idx on public.orders (baker_id);
create index orders_scheduled_date_idx on public.orders (scheduled_date);

alter table public.orders enable row level security;

create policy "Bakers can select their own orders"
  on public.orders for select
  using (baker_id = auth.uid());

create policy "Bakers can insert their own orders"
  on public.orders for insert
  with check (baker_id = auth.uid());

create policy "Bakers can update their own orders"
  on public.orders for update
  using (baker_id = auth.uid())
  with check (baker_id = auth.uid());

create policy "Bakers can delete their own orders"
  on public.orders for delete
  using (baker_id = auth.uid());

create trigger orders_set_updated_at
  before update on public.orders
  for each row
  execute function public.set_updated_at();


-- =========================================================================
-- order_items
-- No baker_id column — ownership checked by joining up to `orders`.
-- product_id / variant_id use `on delete restrict`: the app never hard-
-- deletes products/variants (it deactivates them via is_active), so this
-- is a safety net that stops an accidental hard delete from silently
-- orphaning order history, rather than something the UI is expected to hit.
-- =========================================================================
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity numeric not null,
  unit_price numeric not null,
  line_total numeric not null,
  production_status text not null default 'pending'
    check (production_status in ('pending', 'done')),
  notes text
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

alter table public.order_items enable row level security;

create policy "Bakers can select their own order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
      and o.baker_id = auth.uid()
    )
  );

create policy "Bakers can insert their own order items"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
      and o.baker_id = auth.uid()
    )
  );

create policy "Bakers can update their own order items"
  on public.order_items for update
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
      and o.baker_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
      and o.baker_id = auth.uid()
    )
  );

create policy "Bakers can delete their own order items"
  on public.order_items for delete
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
      and o.baker_id = auth.uid()
    )
  );


-- =========================================================================
-- inventory_movements
-- Every stock change is a row here — ingredients.current_stock is a
-- derived value the app keeps in sync via these rows, never edited
-- directly. This is the audit trail for "what happened to my stock?"
-- ingredient_id uses `on delete restrict` so history can't be silently
-- erased by deleting an ingredient that has movement history.
-- =========================================================================
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  baker_id uuid not null references public.bakers (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  movement_type text not null
    check (movement_type in ('restock', 'usage', 'adjustment', 'waste')),
  quantity_change numeric not null,
  resulting_stock numeric not null,
  reference_type text
    check (reference_type in ('order_item', 'manual')),
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index inventory_movements_baker_id_idx on public.inventory_movements (baker_id);
create index inventory_movements_ingredient_id_idx on public.inventory_movements (ingredient_id);

alter table public.inventory_movements enable row level security;

create policy "Bakers can select their own inventory movements"
  on public.inventory_movements for select
  using (baker_id = auth.uid());

create policy "Bakers can insert their own inventory movements"
  on public.inventory_movements for insert
  with check (baker_id = auth.uid());

create policy "Bakers can update their own inventory movements"
  on public.inventory_movements for update
  using (baker_id = auth.uid())
  with check (baker_id = auth.uid());

create policy "Bakers can delete their own inventory movements"
  on public.inventory_movements for delete
  using (baker_id = auth.uid());


-- =========================================================================
-- expenses
-- category is free text, not a check constraint: docs/PRODUCT.md and
-- docs/UI_UX.md list example categories (Ingredients, Packaging, Gas,
-- Delivery, Utilities, Other) but the app's chip UI is what enforces the
-- set today — a check constraint here would need a migration every time
-- the chip list changes. Revisit if that turns out to be wrong.
-- =========================================================================
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  baker_id uuid not null references public.bakers (id) on delete cascade,
  category text not null,
  amount numeric not null,
  description text,
  expense_date date not null,
  created_at timestamptz not null default now()
);

create index expenses_baker_id_idx on public.expenses (baker_id);
create index expenses_expense_date_idx on public.expenses (expense_date);

alter table public.expenses enable row level security;

create policy "Bakers can select their own expenses"
  on public.expenses for select
  using (baker_id = auth.uid());

create policy "Bakers can insert their own expenses"
  on public.expenses for insert
  with check (baker_id = auth.uid());

create policy "Bakers can update their own expenses"
  on public.expenses for update
  using (baker_id = auth.uid())
  with check (baker_id = auth.uid());

create policy "Bakers can delete their own expenses"
  on public.expenses for delete
  using (baker_id = auth.uid());


-- =========================================================================
-- storefront_settings (1:1 with bakers)
-- =========================================================================
create table public.storefront_settings (
  id uuid primary key default gen_random_uuid(),
  baker_id uuid not null unique references public.bakers (id) on delete cascade,
  slug text not null unique,
  is_public boolean not null default false,
  banner_image_url text,
  description text,
  contact_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index storefront_settings_baker_id_idx on public.storefront_settings (baker_id);

alter table public.storefront_settings enable row level security;

create policy "Bakers can select their own storefront settings"
  on public.storefront_settings for select
  using (baker_id = auth.uid());

create policy "Bakers can insert their own storefront settings"
  on public.storefront_settings for insert
  with check (baker_id = auth.uid());

create policy "Bakers can update their own storefront settings"
  on public.storefront_settings for update
  using (baker_id = auth.uid())
  with check (baker_id = auth.uid());

create policy "Bakers can delete their own storefront settings"
  on public.storefront_settings for delete
  using (baker_id = auth.uid());

create trigger storefront_settings_set_updated_at
  before update on public.storefront_settings
  for each row
  execute function public.set_updated_at();

-- NOTE: this table intentionally has NO policy granting `anon` access.
-- Phase 12 will expose two narrow database functions (get_storefront,
-- submit_storefront_order) for anonymous visitors instead of opening this
-- table directly, per docs/DATABASE.md and docs/ARCHITECTURE.md. Nothing
-- to do here yet — just don't be surprised this table has zero anon access
-- for many phases to come.


-- =========================================================================
-- subscriptions (1:1 with bakers)
-- Placeholder for later billing integration — not wired to a payment
-- provider yet.
-- =========================================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  baker_id uuid not null unique references public.bakers (id) on delete cascade,
  plan text not null default 'free'
    check (plan in ('free', 'premium')),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  current_period_end timestamptz
);

create index subscriptions_baker_id_idx on public.subscriptions (baker_id);

alter table public.subscriptions enable row level security;

create policy "Bakers can select their own subscription"
  on public.subscriptions for select
  using (baker_id = auth.uid());

create policy "Bakers can insert their own subscription"
  on public.subscriptions for insert
  with check (baker_id = auth.uid());

create policy "Bakers can update their own subscription"
  on public.subscriptions for update
  using (baker_id = auth.uid())
  with check (baker_id = auth.uid());

create policy "Bakers can delete their own subscription"
  on public.subscriptions for delete
  using (baker_id = auth.uid());

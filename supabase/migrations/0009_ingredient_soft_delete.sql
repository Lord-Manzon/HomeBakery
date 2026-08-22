-- Ingredients previously had no soft-delete column, unlike products and
-- product_variants (see 0002_phase3_core_tables.sql's is_active columns
-- and the order_items comment on why hard-delete is avoided). In
-- practice, ingredients.id is referenced by inventory_movements with
-- `on delete restrict` -- so ANY ingredient with real stock history
-- (a restock, a use, a waste -- essentially every ingredient a baker has
-- actually touched) could never be hard-deleted anyway. The app's delete
-- flow now archives instead of hard-deleting once an ingredient has
-- history, matching the existing Products pattern rather than inventing
-- a new one.
--
-- Genuinely brand-new, never-used ingredients (no movements, no recipe
-- references) can still be hard-deleted -- see removeIngredient() in
-- src/services/ingredients.ts for the decision logic.
alter table public.ingredients
  add column is_active boolean not null default true;
-- Adds an optional, free-text category to products. No fixed list — see
-- docs/DECISIONS.md's 2026-08-17 entry ("Reopened: product categories are
-- now MVP"). Same pattern as ingredients.category / expenses.category:
-- a nullable text column, no enum/check constraint, since the baker
-- types their own category names and the Products list derives its
-- filter chips dynamically from whatever distinct values exist rather
-- than from a stored/curated list.
--
-- Nullable with no default and no backfill — existing products simply
-- have no category until the baker sets one, and show under "All" only.

alter table public.products
  add column category text;

-- No RLS changes needed — products table policies already scope every
-- column to baker_id = auth.uid(), this new column is covered
-- automatically.
--
-- No new Data API exposure step needed either — products is already
-- exposed (see docs/DECISIONS.md's 2026-08-15 "All Phase 3 tables
-- exposed" entry); exposure applies at the table level, not per-column.

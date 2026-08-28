-- Adds an overridable "total time" field to recipes -- shown next to
-- Yield with a clock icon on the recipe detail screen. Same pattern
-- already used for suggested_price vs. selling_price on product
-- variants: a default is computed (here, summed from each step's
-- duration_minutes, see migration 0010), but the baker can always
-- override it, and once they do, their number sticks instead of being
-- silently recalculated out from under them. Null means "no manual
-- override yet -- fall back to the computed sum"; the UI is
-- responsible for that fallback, not the database.
--
-- `recipes` is already exposed via the Data API (2026-08-15 entry) --
-- adding a column to an already-exposed table needs no separate
-- exposure step, only this migration.

alter table public.recipes
  add column total_time_minutes integer;

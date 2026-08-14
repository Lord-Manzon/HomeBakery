-- Adds baker-level theme preference: an accent color the baker can pick,
-- and a light/dark/system mode. Nullable with sensible defaults so
-- existing baker rows (from Phase 2) don't need backfilling.

alter table public.bakers
  add column theme_accent text not null default '#C9683F',
  add column theme_mode text not null default 'system'
    check (theme_mode in ('light', 'dark', 'system'));

-- No RLS changes needed — bakers table policies already scope every
-- column to baker_id = auth.uid(), these two new columns are covered
-- automatically.

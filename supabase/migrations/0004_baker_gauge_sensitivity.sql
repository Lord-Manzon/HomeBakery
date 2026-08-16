-- Adds a baker-level preference controlling how sensitive the ingredient
-- stock gauge (Ingredients list + detail screen) reads relative to each
-- ingredient's low_stock_threshold. See docs/DECISIONS.md for the
-- multiplier reasoning — this does NOT add a max_stock column; the gauge
-- ceiling is always derived as low_stock_threshold * multiplier, computed
-- in src/services/stockGauge.ts, never stored per-ingredient.
--
-- Same pattern as 0003_baker_theme_preference.sql: not null with a
-- sensible default so existing baker rows don't need backfilling.

alter table public.bakers
  add column gauge_sensitivity text not null default 'balanced'
    check (gauge_sensitivity in ('tight', 'balanced', 'relaxed'));

-- No RLS changes needed — bakers table policies already scope every
-- column to baker_id = auth.uid(), this new column is covered
-- automatically.

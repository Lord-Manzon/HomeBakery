-- Phase 8 (Production screen): adds the baker-level preference controlling
-- whether checking a product off the production checklist automatically
-- deducts its recipe's ingredients from inventory (see
-- src/services/production.ts and docs/DECISIONS.md's Phase 8 entry).
--
-- No new table for production itself -- per docs/DATABASE.md, the
-- checklist is derived entirely from existing order_items
-- (production_status) grouped by scheduled_date. This migration only adds
-- the one new baker-level setting the feature needs.
--
-- Same pattern as 0004_baker_gauge_sensitivity.sql: not null with a
-- sensible default so existing baker rows don't need backfilling. Default
-- true matches docs/PRODUCT.md's "automatic ingredient deduction is ON by
-- default" spec.

alter table public.bakers
  add column auto_deduct_inventory boolean not null default true;

-- No RLS changes needed -- bakers table policies already scope every
-- column to baker_id = auth.uid(), this new column is covered
-- automatically.

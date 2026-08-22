-- Phase 7 (Orders): simplifies orders.status from 6 values to 4, and
-- loosens orders.payment_method from a fixed 3-value list to free text.
-- See docs/DECISIONS.md's 2026-08-22 entry for full reasoning.
--
-- STATUS: 'confirmed' and 'preparing' are dropped. An order-level status
-- doesn't need to shadow per-item baking progress -- Phase 8's Production
-- screen already tracks that via order_items.production_status. 'ready'
-- is renamed to 'delivered' to match what the baker action actually
-- means. New lifecycle: pending -> delivered -> completed, or cancelled
-- (from pending or delivered, not from completed). 'completed' is set
-- automatically once BOTH delivered and paid are true -- app-layer logic
-- in src/services/orderLogic.ts, not a DB trigger, so it stays visible
-- and testable in one place rather than hidden in SQL.
--
-- PAYMENT METHOD: was capped at ('gcash', 'cash', 'bank_transfer'), which
-- doesn't fit a baker outside the Philippines (e.g. PayPal, Venmo). Now
-- nullable free text, matching the existing products.category /
-- ingredients.category / expenses.category pattern -- curated quick-pick
-- chips live in the UI (src/utils/validation/orderSchemas.ts), not a
-- DB-level enum, so a baker's actual payment app doesn't need a schema
-- change to be selectable later.
--
-- Safety: no order rows should exist yet (the Orders UI didn't exist
-- before this phase), but the UPDATEs below defensively remap any stray
-- legacy status values before the stricter constraint is applied, so this
-- migration can't fail on unexpected data. Early-pipeline values fall
-- back to 'pending' (not 'delivered' -- they were never fulfilled),
-- 'ready' maps to 'delivered' since it's the closest semantic match.

update public.orders
  set status = 'pending'
  where status in ('confirmed', 'preparing');

update public.orders
  set status = 'delivered'
  where status = 'ready';

alter table public.orders
  drop constraint orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'delivered', 'completed', 'cancelled'));

alter table public.orders
  drop constraint orders_payment_method_check;

-- payment_method is now a plain nullable text column -- no check
-- constraint. Length/emptiness is validated at the app layer
-- (src/utils/validation/orderSchemas.ts's paymentMethodFormSchema).
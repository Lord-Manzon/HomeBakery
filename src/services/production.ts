import { supabase } from './supabase';
import { applyProductionDeduction, getNetDeductionByOrderItem } from './ingredients';
import { buildDeductionLinesForItem, type ProductionSourceItem } from './productionLogic';
import type { ProductionStatus } from '../types/order';

type RawIngredient = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  low_stock_threshold: number | null;
};

type RawRecipeIngredient = { quantity: number; ingredient: RawIngredient | null };

type RawOrderItem = {
  id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  production_status: ProductionStatus;
  notes: string | null;
  products: { name: string } | null;
  product_variants:
    | {
        name: string;
        recipe_portion: number | null;
        recipe: { recipe_ingredients: RawRecipeIngredient[] } | null;
      }
    | null;
};

type RawProductionOrder = { scheduled_date: string; order_items: RawOrderItem[] };

// Same "products only ever restrict-deleted, never actually gone" reasoning
// as orders.ts's mapOrderItem -- the ?? fallbacks are defensive, not expected.
function mapRawOrderToSourceItems(order: RawProductionOrder): ProductionSourceItem[] {
  return (order.order_items ?? []).map((row) => ({
    orderItemId: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    productName: row.products?.name ?? 'Deleted product',
    variantName: row.product_variants?.name ?? 'Deleted variant',
    quantity: row.quantity,
    productionStatus: row.production_status,
    notes: row.notes,
    scheduledDate: order.scheduled_date,
    recipePortion: row.product_variants?.recipe_portion ?? null,
    recipeIngredients: (row.product_variants?.recipe?.recipe_ingredients ?? [])
      .filter((ri): ri is RawRecipeIngredient & { ingredient: RawIngredient } => !!ri.ingredient)
      .map((ri) => ({
        ingredientId: ri.ingredient.id,
        ingredientName: ri.ingredient.name,
        unit: ri.ingredient.unit,
        currentStock: ri.ingredient.current_stock,
        lowStockThreshold: ri.ingredient.low_stock_threshold,
        quantityPerBatch: ri.quantity,
      })),
  }));
}

/**
 * Same nested-embed pattern as orders.ts's ORDER_WITH_ITEMS_SELECT, just
 * deeper -- starts from `orders` (not `order_items`) so date/status
 * filtering happens on real top-level columns rather than needing an
 * `!inner`-joined filter on an embedded table.
 *
 * Only active orders (pending/delivered) count as production, same
 * scoping as orders.ts's Today/Upcoming filters -- a cancelled order's
 * items shouldn't show up as something to bake.
 */
const PRODUCTION_SELECT = `
  scheduled_date,
  order_items(
    id,
    product_id,
    variant_id,
    quantity,
    production_status,
    notes,
    products(name),
    product_variants(
      name,
      recipe_portion,
      recipe:recipes(
        recipe_ingredients(
          quantity,
          ingredient:ingredients(id, name, unit, current_stock, low_stock_threshold)
        )
      )
    )
  )
`;

/** Every active order_item scheduled on exactly this date -- powers the
 * Today/Tomorrow tabs. */
export async function getProductionSourceItems(date: string): Promise<ProductionSourceItem[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(PRODUCTION_SELECT)
    .eq('scheduled_date', date)
    .in('status', ['pending', 'delivered']);
  if (error) throw error;
  return (data as unknown as RawProductionOrder[]).flatMap(mapRawOrderToSourceItems);
}

/** Every active order_item scheduled strictly after `dateExclusive` --
 * powers the "Upcoming" tab (called with tomorrow's date, so it starts
 * the day after). */
export async function getProductionSourceItemsAfter(
  dateExclusive: string
): Promise<ProductionSourceItem[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(PRODUCTION_SELECT)
    .gt('scheduled_date', dateExclusive)
    .in('status', ['pending', 'delivered'])
    .order('scheduled_date', { ascending: true });
  if (error) throw error;
  return (data as unknown as RawProductionOrder[]).flatMap(mapRawOrderToSourceItems);
}

/**
 * Checks/unchecks one Production row (all of its underlying order_items
 * together) and, if auto-deduction is on, deducts/reverses immediately.
 *
 * Per product decision (2026-08-28), superseding this feature's original
 * "wait for the whole day" gate: marking one specific product done means
 * that product's own ingredients were genuinely used, whether or not the
 * rest of the day's list is finished yet -- gating on full-day completion
 * was solving a problem that doesn't actually exist at the per-product
 * level. See docs/DECISIONS.md for the full reasoning and the earlier
 * (now superseded) entry.
 *
 * `items` is this row's own underlying order_items (id, quantity, and
 * recipe data) -- the caller already has this from whichever
 * Today/Tomorrow/Upcoming query populated the screen, so this no longer
 * needs to fetch anything beyond the update itself.
 *
 * Idempotent via getNetDeductionByOrderItem (ingredients.ts): only
 * order_items that aren't already net-deducted get deducted when marking
 * done, and only ones that ARE net-deducted get reversed when marking
 * pending -- so re-toggling the same row repeatedly never double-deducts
 * or double-reverses. Never blocks on insufficient stock -- see
 * ingredients.ts's applyProductionDeduction, which allows stock to go
 * negative rather than silently skip the deduction; the UI warns and asks
 * for confirmation before calling this when stock is short, but this
 * function itself has no floor.
 */
export async function setProductionRowStatus(
  items: Pick<ProductionSourceItem, 'orderItemId' | 'quantity' | 'recipePortion' | 'recipeIngredients'>[],
  newStatus: ProductionStatus,
  autoDeductEnabled: boolean
): Promise<void> {
  const orderItemIds = items.map((item) => item.orderItemId);
  const { error } = await supabase
    .from('order_items')
    .update({ production_status: newStatus })
    .in('id', orderItemIds);
  if (error) throw error;

  if (!autoDeductEnabled || items.length === 0) return;

  const net = await getNetDeductionByOrderItem(orderItemIds);
  const targets =
    newStatus === 'done'
      ? items.filter((item) => (net.get(item.orderItemId) ?? 0) >= 0)
      : items.filter((item) => (net.get(item.orderItemId) ?? 0) < 0);

  const lines = targets.flatMap((item) =>
    buildDeductionLinesForItem(item).map((line) => ({ ...line, orderItemId: item.orderItemId }))
  );
  if (lines.length > 0) {
    await applyProductionDeduction(lines, newStatus === 'done' ? 'deduct' : 'reverse');
  }
}

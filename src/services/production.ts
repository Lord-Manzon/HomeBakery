import { supabase } from './supabase';
import { applyProductionDeduction, getNetDeductionByOrderItem, type ProductionDeductionLine } from './ingredients';
import { buildDeductionLinesForItem, isEveryItemDone, type ProductionSourceItem } from './productionLogic';
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

function toDeductionLines(items: ProductionSourceItem[]): ProductionDeductionLine[] {
  return items.flatMap((item) =>
    buildDeductionLinesForItem(item).map((line) => ({ ...line, orderItemId: item.orderItemId }))
  );
}

/**
 * Checks/unchecks one Production row (all of its underlying order_items
 * together) and, if auto-deduction is on, handles inventory.
 *
 * Per product decision (2026-08-27): deduction is gated on the WHOLE
 * scheduled_date's checklist reaching 100%, not fired the moment any one
 * row is checked -- a baker who's mid-way through a day's bake list
 * hasn't necessarily used an ingredient yet just because one item is
 * done, and this avoids partial/inconsistent stock reads while the list
 * is still in progress.
 *
 * Idempotent by design, via getNetDeductionByOrderItem (see
 * ingredients.ts): every time this function runs and finds the day
 * complete, it deducts only the order_items that don't ALREADY have a
 * net-negative usage movement -- so re-completing a day after a partial
 * uncheck/recheck cycle only deducts the gap, never double-deducts.
 *
 * If this toggle just UNCHECKED a row and broke a previously-complete
 * day, only that row's own already-deducted items are reversed (again
 * via the net-deduction check) -- a row that was unchecked before the
 * day ever reached 100% has nothing to reverse.
 */
export async function setProductionRowStatus(
  orderItemIds: string[],
  newStatus: ProductionStatus,
  scheduledDate: string,
  autoDeductEnabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('order_items')
    .update({ production_status: newStatus })
    .in('id', orderItemIds);
  if (error) throw error;

  if (!autoDeductEnabled) return;

  const dayItems = await getProductionSourceItems(scheduledDate);
  const dayComplete = isEveryItemDone(dayItems.map((i) => i.productionStatus));

  if (dayComplete) {
    const net = await getNetDeductionByOrderItem(dayItems.map((i) => i.orderItemId));
    const notYetDeducted = dayItems.filter((i) => (net.get(i.orderItemId) ?? 0) >= 0);
    const lines = toDeductionLines(notYetDeducted);
    if (lines.length > 0) {
      await applyProductionDeduction(lines, 'deduct');
    }
    return;
  }

  if (newStatus === 'pending') {
    const net = await getNetDeductionByOrderItem(orderItemIds);
    const byId = new Map(dayItems.map((i) => [i.orderItemId, i]));
    const previouslyDeducted = orderItemIds
      .filter((id) => (net.get(id) ?? 0) < 0)
      .map((id) => byId.get(id))
      .filter((i): i is ProductionSourceItem => !!i);
    const lines = toDeductionLines(previouslyDeducted);
    if (lines.length > 0) {
      await applyProductionDeduction(lines, 'reverse');
    }
  }
}

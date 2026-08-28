import { getStockGaugeStatus } from './stockGauge';
import type { ProductionStatus } from '../types/order';

/**
 * One recipe_ingredients row, with its ingredient's current stock details
 * attached — the shape a ProductionSourceItem needs so the whole screen
 * (checklist + "Needed for production" list) can be built from a single
 * fetch, no second round trip per ingredient. `quantityPerBatch` is the
 * recipe_ingredients.quantity for one FULL batch (see costing.ts's
 * calculateRecipeBatchCost) — NOT yet scaled to any variant/quantity.
 */
export type ProductionRecipeIngredient = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  currentStock: number;
  lowStockThreshold: number | null;
  quantityPerBatch: number;
};

/**
 * One order_item, flattened and normalized for the pure functions below —
 * production.ts (the Supabase-backed service) is responsible for mapping
 * the raw joined query result into this shape.
 */
export type ProductionSourceItem = {
  orderItemId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  productionStatus: ProductionStatus;
  notes: string | null;
  /** Postgres `date` "YYYY-MM-DD" of the order this item belongs to. */
  scheduledDate: string;
  /** Null when the variant has no recipe linked yet (Phase 6 not done for
   * this product) — such an item contributes no ingredient requirements
   * and nothing is deducted for it, but it still shows on the checklist. */
  recipePortion: number | null;
  recipeIngredients: ProductionRecipeIngredient[];
};

/** One row on the Production checklist — every order_item sharing the
 * same product+variant on the same date, collapsed into a single
 * checkable line with a combined quantity. See docs/DECISIONS.md's Phase
 * 8 entry for why aggregation happens at this granularity. */
export type ProductionRow = {
  key: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  totalQuantity: number;
  orderItemIds: string[];
  /** True only when EVERY underlying order_item is 'done'. Checking this
   * row toggles all of them together — see production.ts's
   * setProductionRowStatus. */
  isDone: boolean;
  /** Shown only when every underlying order_item that has a note agrees
   * on the same text — a genuine conflict (two different notes rolled
   * into one aggregated row) shows nothing here rather than picking one
   * arbitrarily or concatenating them, since a baker skimming this list
   * needs a note to be trustworthy, not a guess. */
  note: string | null;
  recipePortion: number | null;
  recipeIngredients: ProductionRecipeIngredient[];
};

export type ProductionIngredientStatus = 'enough' | 'low' | 'insufficient';

/** One ingredient's line in the "Needed for production" list — amount
 * required is summed across every row for the date(s) being viewed. */
export type IngredientRequirement = {
  ingredientId: string;
  name: string;
  unit: string;
  currentStock: number;
  lowStockThreshold: number | null;
  amountNeeded: number;
  status: ProductionIngredientStatus;
};

/**
 * Amount of one ingredient needed for `unitsOrdered` units of a variant.
 * recipe_portion is "how much of one full batch this variant uses" (see
 * costing.ts's calculateVariantCost) — the same per-unit math, just
 * multiplied by quantity instead of collapsed into a cost.
 *
 * Returns 0 (not the batch amount) when recipePortion is null — a variant
 * with no recipe linked yet needs nothing tracked, rather than silently
 * assuming a full batch.
 */
export function computeIngredientAmount(
  quantityPerBatch: number,
  recipePortion: number | null,
  unitsOrdered: number
): number {
  if (recipePortion == null) return 0;
  return quantityPerBatch * recipePortion * unitsOrdered;
}

/**
 * Ingredient status for production purposes. Two independent checks,
 * checked in this order:
 *  1. Not even enough on hand for what THIS batch needs -> "insufficient"
 *     (danger) regardless of the ingredient's own low-stock threshold —
 *     this is a harder blocker than "running low in general."
 *  2. Otherwise, reuse the existing stock-gauge threshold rule (the same
 *     one the Ingredients tab's low-stock badge uses) -> "low" (warning)
 *     or "enough" (success).
 *
 * Verified against every example row in the approved mockup (flour/sugar/
 * cocoa/butter/eggs/ube halaya) — e.g. sugar (1.2kg on hand, 1.1kg needed)
 * has enough for this batch but still reads "Low" because it's already at
 * its low_stock_threshold; cocoa (500g on hand, 760g needed) reads "Need
 * restock" because on-hand can't cover this batch at all.
 */
export function getProductionIngredientStatus(
  currentStock: number,
  amountNeeded: number,
  lowStockThreshold: number | null
): ProductionIngredientStatus {
  if (currentStock < amountNeeded) return 'insufficient';
  const gaugeStatus = getStockGaugeStatus(currentStock, lowStockThreshold);
  return gaugeStatus === 'low' || gaugeStatus === 'out' ? 'low' : 'enough';
}

/**
 * Groups raw order_items into checklist rows (see ProductionRow's
 * comment for the aggregation rule). Every item in a group shares the
 * same product+variant, so they also share the same recipe/recipe_portion
 * — safe to read those off the first item in the group.
 */
export function groupProductionItems(items: ProductionSourceItem[]): ProductionRow[] {
  const groups = new Map<string, ProductionSourceItem[]>();
  for (const item of items) {
    const key = `${item.productId}:${item.variantId}`;
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const rows: ProductionRow[] = [];
  for (const groupItems of groups.values()) {
    const first = groupItems[0];
    const totalQuantity = groupItems.reduce((sum, i) => sum + i.quantity, 0);
    const isDone = groupItems.every((i) => i.productionStatus === 'done');
    const distinctNotes = Array.from(
      new Set(
        groupItems
          .map((i) => i.notes?.trim())
          .filter((n): n is string => !!n && n.length > 0)
      )
    );

    rows.push({
      key: `${first.productId}:${first.variantId}`,
      productId: first.productId,
      variantId: first.variantId,
      productName: first.productName,
      variantName: first.variantName,
      totalQuantity,
      orderItemIds: groupItems.map((i) => i.orderItemId),
      isDone,
      note: distinctNotes.length === 1 ? distinctNotes[0] : null,
      recipePortion: first.recipePortion,
      recipeIngredients: first.recipeIngredients,
    });
  }

  // Alphabetical by product then variant -- a simple, predictable scan
  // order. The list itself doesn't imply any other priority (done items
  // aren't sorted to the bottom, low-ingredient items aren't sorted to
  // the top) so a baker's own mental model of "where's item X" stays
  // stable across checks.
  return rows.sort(
    (a, b) => a.productName.localeCompare(b.productName) || a.variantName.localeCompare(b.variantName)
  );
}

/**
 * Groups raw order_items first by their own scheduled_date, then into
 * checklist rows within each date — powers the "Upcoming" tab, which (per
 * product decision, 2026-08-27) shows one date-headed section per day
 * rather than a single flat list, since a combined progress bar across
 * unrelated future days isn't a meaningful number.
 */
export function groupProductionItemsByDate(
  items: ProductionSourceItem[]
): { date: string; rows: ProductionRow[] }[] {
  const byDate = new Map<string, ProductionSourceItem[]>();
  for (const item of items) {
    const list = byDate.get(item.scheduledDate);
    if (list) {
      list.push(item);
    } else {
      byDate.set(item.scheduledDate, [item]);
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, dateItems]) => ({ date, rows: groupProductionItems(dateItems) }));
}

/** "N of M completed" + percent for the progress bar. Counts ROWS
 * (checklist lines), not raw order_items -- matches what a baker actually
 * sees and checks off. */
export function calculateProductionProgress(rows: ProductionRow[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = rows.length;
  const completed = rows.filter((r) => r.isDone).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

/**
 * Sums every row's ingredient needs into one "Needed for production" list
 * (this is the shared-inventory-pool view: two products drawing on the
 * same flour both count against the same total). Status is resolved
 * AFTER summing, against the combined total -- not per-row -- so a
 * shortfall only visible once every product's need is added up still
 * shows correctly.
 */
export function buildIngredientRequirements(rows: ProductionRow[]): IngredientRequirement[] {
  const totals = new Map<string, { req: Omit<IngredientRequirement, 'status'> }>();

  for (const row of rows) {
    for (const ri of row.recipeIngredients) {
      const amount = computeIngredientAmount(ri.quantityPerBatch, row.recipePortion, row.totalQuantity);
      if (amount <= 0) continue;

      const existing = totals.get(ri.ingredientId);
      if (existing) {
        existing.req.amountNeeded += amount;
      } else {
        totals.set(ri.ingredientId, {
          req: {
            ingredientId: ri.ingredientId,
            name: ri.ingredientName,
            unit: ri.unit,
            currentStock: ri.currentStock,
            lowStockThreshold: ri.lowStockThreshold,
            amountNeeded: amount,
          },
        });
      }
    }
  }

  return Array.from(totals.values())
    .map(({ req }) => ({
      ...req,
      status: getProductionIngredientStatus(req.currentStock, req.amountNeeded, req.lowStockThreshold),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Which (and how many) of a row's own recipe ingredients are currently
 * low/insufficient, per the DAY-WIDE status map from
 * buildIngredientRequirements -- not a per-row-only comparison, so two
 * products sharing a strained ingredient both correctly show the
 * warning. Powers each checklist row's "⚠ N ingredients low" badge.
 */
export function countLowIngredientsForRow(
  row: ProductionRow,
  statusByIngredientId: Map<string, ProductionIngredientStatus>
): number {
  let count = 0;
  for (const ri of row.recipeIngredients) {
    const status = statusByIngredientId.get(ri.ingredientId);
    if (status === 'low' || status === 'insufficient') count += 1;
  }
  return count;
}

/**
 * Per-ingredient deduction amounts for ONE order_item (not a whole row) —
 * production.ts needs this granularity so each deduction/reversal can be
 * tagged with a real order_item id (inventory_movements.reference_id),
 * keeping the audit trail traceable to an actual order line rather than
 * an aggregated checklist row that may span several orders.
 */
export function buildDeductionLinesForItem(
  item: Pick<ProductionSourceItem, 'quantity' | 'recipePortion' | 'recipeIngredients'>
): { ingredientId: string; amount: number }[] {
  if (item.recipePortion == null) return [];
  return item.recipeIngredients
    .map((ri) => ({
      ingredientId: ri.ingredientId,
      amount: computeIngredientAmount(ri.quantityPerBatch, item.recipePortion, item.quantity),
    }))
    .filter((line) => line.amount > 0);
}

/** One of a row's own ingredients that doesn't have enough CURRENT stock
 * to cover what that row itself needs. */
export type InsufficientIngredientLine = {
  ingredientId: string;
  name: string;
  unit: string;
  currentStock: number;
  amountNeeded: number;
};

/**
 * Which of a single row's own ingredients are short, checked at the
 * moment a baker is about to mark it done — used to warn before
 * completing (never to block it; see ingredients.ts's
 * applyProductionDeduction, which allows stock to go negative).
 *
 * Deliberately independent of buildIngredientRequirements' day-wide
 * totals: this checks the row's own need against each ingredient's own
 * current stock, since that's specifically what's about to get deducted
 * for THIS product, not the combined day's requirement.
 */
export function getInsufficientIngredientsForRow(row: ProductionRow): InsufficientIngredientLine[] {
  const lines: InsufficientIngredientLine[] = [];
  for (const ri of row.recipeIngredients) {
    const amountNeeded = computeIngredientAmount(ri.quantityPerBatch, row.recipePortion, row.totalQuantity);
    if (amountNeeded <= 0) continue;
    if (ri.currentStock < amountNeeded) {
      lines.push({
        ingredientId: ri.ingredientId,
        name: ri.ingredientName,
        unit: ri.unit,
        currentStock: ri.currentStock,
        amountNeeded,
      });
    }
  }
  return lines;
}

/** True only when there's at least one item and every one of them is
 * 'done' -- an empty list is never considered "complete" (there's nothing
 * to complete). No longer used to gate deduction (see production.ts's
 * 2026-08-28 decision — deduction is per-row now, not per-day) but kept
 * as a small, tested, potentially reusable building block (e.g. a future
 * "day fully baked" indicator). */
export function isEveryItemDone(statuses: ProductionStatus[]): boolean {
  return statuses.length > 0 && statuses.every((s) => s === 'done');
}

/**
 * Weighted-average cost-per-unit after a restock. Pure function, unit
 * tested separately (see ingredientLogic.test.ts) per
 * docs/CODING_STANDARDS.md -- this is exactly the kind of number a baker
 * will trust for their costing math.
 *
 * Blends the value of stock already on hand with the new purchase, rather
 * than discarding what was already there. If currentStock is 0 (first
 * ever restock, or ingredient was fully depleted), the result is simply
 * this purchase's price per unit.
 *
 * Moved out of ingredients.ts on 2026-08-22 (see docs/DECISIONS.md) --
 * this file deliberately has NO Supabase import, matching the same
 * pure-logic-file pattern already used by costing.ts, stockGauge.ts, and
 * orderLogic.ts. ingredients.ts imports `supabase` at its top, so any
 * test importing so much as one function from it drags in the real
 * Supabase client (and, through it, AsyncStorage), which then needs a
 * native-module mock to run under Jest at all. Living in its own
 * import-free file means this function's test can run with zero mocking.
 */
export function calculateRestockCostPerUnit(
  currentStock: number,
  currentCostPerUnit: number,
  quantityAdded: number,
  totalCostPaid: number
): number {
  const totalStockAfter = currentStock + quantityAdded;
  if (totalStockAfter <= 0) return currentCostPerUnit; // guard: avoid divide-by-zero
  const existingValue = currentStock * currentCostPerUnit;
  return (existingValue + totalCostPaid) / totalStockAfter;
}

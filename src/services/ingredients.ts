import { supabase } from './supabase';
import type { Ingredient, InventoryMovement, MovementType } from '../types/ingredient';
import type { IngredientFormInput, RestockFormInput, UseWasteReason } from '../utils/validation/ingredientSchemas';

export async function getIngredients(): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return data as Ingredient[];
}

export async function getIngredient(id: string): Promise<Ingredient> {
  const { data, error } = await supabase.from('ingredients').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Ingredient;
}

export async function getMovementHistory(ingredientId: string): Promise<InventoryMovement[]> {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('ingredient_id', ingredientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as InventoryMovement[];
}

/**
 * Sum of today's `usage` + `waste` movements per ingredient, keyed by
 * ingredient_id — powers the "Used Xkg today" card badge (see
 * IngredientCard in app/(tabs)/ingredients/index.tsx).
 *
 * "Today" is the LOCAL calendar day (resets at midnight on the baker's
 * device), not a rolling 24h window — matches how a baker actually
 * thinks about it ("what did I use today" = today's bake), and is a
 * simpler, cheaper query than a continuously-sliding window. See
 * docs/DECISIONS.md's usage-badge entry if one gets added.
 *
 * Both `usage` (Used in production) and `waste` (Wasted/Spoiled) count
 * toward the same total, and the badge always reads "Used" regardless
 * of reason — deliberately not splitting into separate used/wasted
 * badges, per product decision.
 *
 * quantity_change is stored negative for usage/waste (see
 * recordUseOrWaste below), so this returns positive totals via Math.abs.
 */
export async function getTodayUsage(): Promise<Record<string, number>> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('inventory_movements')
    .select('ingredient_id, quantity_change')
    .in('movement_type', ['usage', 'waste'] satisfies MovementType[])
    .gte('created_at', startOfToday.toISOString());
  if (error) throw error;

  const totals: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = row.ingredient_id as string;
    totals[id] = (totals[id] ?? 0) + Math.abs(row.quantity_change as number);
  }
  return totals;
}

async function getCurrentBakerId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error('No authenticated user.');
  return id;
}

/**
 * Creates a new ingredient. Per the Phase 5 spec, the starting quantity
 * does NOT create an inventory_movements row — there's no "before" stock
 * level to log a change against, it's just the ingredient's initial value.
 */
export async function createIngredient(input: IngredientFormInput): Promise<Ingredient> {
  const bakerId = await getCurrentBakerId();
  const { data, error } = await supabase
    .from('ingredients')
    .insert({
      baker_id: bakerId,
      name: input.name,
      category: input.category ?? null,
      unit: input.unit,
      current_stock: input.quantity,
      low_stock_threshold: input.lowStockThreshold ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Ingredient;
}

/**
 * Edits an ingredient. Per the Phase 5 spec: if `quantity` differs from
 * the ingredient's current stock, that difference produces an
 * `adjustment` movement (quantity_change = new - old) so the audit trail
 * stays accurate — this is the ONLY path that creates an `adjustment`
 * movement; there's no separate "Adjust stock" button.
 */
export async function updateIngredient(
  id: string,
  input: IngredientFormInput
): Promise<Ingredient> {
  const bakerId = await getCurrentBakerId();
  const existing = await getIngredient(id);
  const quantityChanged = input.quantity !== existing.current_stock;

  const { data, error } = await supabase
    .from('ingredients')
    .update({
      name: input.name,
      category: input.category ?? null,
      unit: input.unit,
      current_stock: input.quantity,
      low_stock_threshold: input.lowStockThreshold ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  if (quantityChanged) {
    const delta = input.quantity - existing.current_stock;
    const { error: movementError } = await supabase.from('inventory_movements').insert({
      baker_id: bakerId,
      ingredient_id: id,
      movement_type: 'adjustment' satisfies MovementType,
      quantity_change: delta,
      resulting_stock: input.quantity,
      reference_type: 'manual',
      note: 'Manual correction',
    });
    if (movementError) throw movementError;
  }

  return data as Ingredient;
}

export type BlockingRecipe = { id: string; name: string };

export type RemoveIngredientResult =
  | { action: 'deleted' }
  | { action: 'archived' }
  | { action: 'blocked'; recipes: BlockingRecipe[] };

/**
 * Replaces the old hard-delete-only deleteIngredient(). Ingredients are
 * now only ever hard-deleted if they're completely untouched (no recipe
 * references, no stock history) — otherwise they're archived
 * (is_active = false), matching the existing Products pattern (see
 * supabase/migrations/0009_ingredient_soft_delete.sql for why).
 *
 * Decision order:
 *  1. Still used in a recipe right now -> BLOCKED. This is the one case
 *     that stays a hard stop rather than silently archiving — an active
 *     recipe still depends on this ingredient for its cost math, so the
 *     baker needs to know and decide, not have it vanish out from under
 *     a recipe that's still using it.
 *  2. No recipe use, but has stock history (any restock/use/waste ever
 *     logged) -> ARCHIVED. Preserves the audit trail, just hides it from
 *     the active list.
 *  3. No recipe use, no history at all -> DELETED for real. Nothing to
 *     preserve.
 */
/**
 * Every recipe currently referencing this ingredient. Shared by
 * removeIngredient() (deciding whether removal is blocked) and the
 * ingredient detail screen's permanent "Used in" section — same query
 * either way, so it's factored out rather than duplicated.
 */
export async function getRecipesUsingIngredient(ingredientId: string): Promise<BlockingRecipe[]> {
  const { data, error } = await supabase
    .from('recipe_ingredients')
    .select('recipe:recipes(id, name)')
    .eq('ingredient_id', ingredientId);
  if (error) throw error;
  return dedupeRecipes((data ?? []).map((row: any) => row.recipe).filter(Boolean));
}

export async function removeIngredient(id: string): Promise<RemoveIngredientResult> {
  const blockingRecipes = await getRecipesUsingIngredient(id);
  if (blockingRecipes.length > 0) {
    return { action: 'blocked', recipes: blockingRecipes };
  }

  const { count, error: movementError } = await supabase
    .from('inventory_movements')
    .select('id', { count: 'exact', head: true })
    .eq('ingredient_id', id);
  if (movementError) throw movementError;

  if ((count ?? 0) > 0) {
    const { error: archiveError } = await supabase
      .from('ingredients')
      .update({ is_active: false })
      .eq('id', id);
    if (archiveError) throw archiveError;
    return { action: 'archived' };
  }

  const { error: deleteError } = await supabase.from('ingredients').delete().eq('id', id);
  if (deleteError) throw deleteError;
  return { action: 'deleted' };
}

function dedupeRecipes(recipes: BlockingRecipe[]): BlockingRecipe[] {
  const seen = new Map<string, BlockingRecipe>();
  for (const r of recipes) seen.set(r.id, r);
  return Array.from(seen.values());
}

/**
 * Weighted-average cost-per-unit after a restock. Pure function, unit
 * tested separately (see ingredients.test.ts) per
 * docs/CODING_STANDARDS.md — this is exactly the kind of number a baker
 * will trust for their costing math.
 *
 * Blends the value of stock already on hand with the new purchase, rather
 * than discarding what was already there. If currentStock is 0 (first
 * ever restock, or ingredient was fully depleted), the result is simply
 * this purchase's price per unit.
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

/**
 * Records a restock: inserts a `restock` movement, increases
 * current_stock, and — only if totalCostPaid was provided — recalculates
 * cost_per_unit via the weighted-average formula above. If totalCostPaid
 * is left blank, stock increases but cost_per_unit is left unchanged,
 * since there's nothing to compute a new average from.
 */
export async function restockIngredient(
  id: string,
  input: RestockFormInput
): Promise<Ingredient> {
  const bakerId = await getCurrentBakerId();
  const existing = await getIngredient(id);

  const newStock = existing.current_stock + input.quantity;
  const newCostPerUnit =
    input.totalCostPaid != null
      ? calculateRestockCostPerUnit(
          existing.current_stock,
          existing.cost_per_unit,
          input.quantity,
          input.totalCostPaid
        )
      : existing.cost_per_unit;

  const { data, error } = await supabase
    .from('ingredients')
    .update({ current_stock: newStock, cost_per_unit: newCostPerUnit })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  const { error: movementError } = await supabase.from('inventory_movements').insert({
    baker_id: bakerId,
    ingredient_id: id,
    movement_type: 'restock' satisfies MovementType,
    quantity_change: input.quantity,
    resulting_stock: newStock,
    reference_type: 'manual',
    note: 'Restocked',
  });
  if (movementError) throw movementError;

  return data as Ingredient;
}

/**
 * Net quantity_change (usage movements only, tagged reference_type
 * 'order_item') already recorded per order_item, for the given ids.
 * Negative = currently deducted; zero or missing = not currently
 * deducted (either never deducted, or deducted then fully reversed).
 *
 * This is how production.ts's setProductionRowStatus stays idempotent
 * across repeated check/uncheck cycles WITHOUT a separate "already
 * deducted" flag anywhere: deduction inserts a negative movement,
 * reversal inserts the exact positive opposite, and this net sum is
 * always the true current state either way.
 */
export async function getNetDeductionByOrderItem(
  orderItemIds: string[]
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (orderItemIds.length === 0) return totals;

  const { data, error } = await supabase
    .from('inventory_movements')
    .select('reference_id, quantity_change')
    .eq('reference_type', 'order_item')
    .eq('movement_type', 'usage' satisfies MovementType)
    .in('reference_id', orderItemIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const id = row.reference_id as string;
    totals.set(id, (totals.get(id) ?? 0) + (row.quantity_change as number));
  }
  return totals;
}

export type ProductionDeductionLine = { ingredientId: string; orderItemId: string; amount: number };

/**
 * Applies (direction 'deduct') or reverses (direction 'reverse') Production
 * ingredient usage in one go — see production.ts's setProductionRowStatus
 * for when each direction is used. One inventory_movements row per
 * (ingredient, order_item) pair, tagged reference_type 'order_item' /
 * reference_id = that order_item's id, so the audit trail stays traceable
 * to an actual order line (see getNetDeductionByOrderItem above).
 *
 * Grouped by ingredient so an ingredient touched by several lines in one
 * call only does one stock read-then-write. Sequential awaits across
 * ingredients — same reasoning as recordUseOrWaste: a production day's
 * ingredient list is a handful of rows, not hundreds, and the Supabase
 * client has no multi-table transaction to batch this into anyway.
 */
export async function applyProductionDeduction(
  lines: ProductionDeductionLine[],
  direction: 'deduct' | 'reverse'
): Promise<void> {
  if (lines.length === 0) return;
  const bakerId = await getCurrentBakerId();

  const byIngredient = new Map<string, ProductionDeductionLine[]>();
  for (const line of lines) {
    const existing = byIngredient.get(line.ingredientId);
    if (existing) {
      existing.push(line);
    } else {
      byIngredient.set(line.ingredientId, [line]);
    }
  }

  for (const [ingredientId, entries] of byIngredient) {
    const existing = await getIngredient(ingredientId);
    const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
    const signedTotal = direction === 'deduct' ? -totalAmount : totalAmount;
    const newStock = existing.current_stock + signedTotal;

    const { error: stockError } = await supabase
      .from('ingredients')
      .update({ current_stock: newStock })
      .eq('id', ingredientId);
    if (stockError) throw stockError;

    let runningStock = existing.current_stock;
    for (const entry of entries) {
      const signedAmount = direction === 'deduct' ? -entry.amount : entry.amount;
      runningStock += signedAmount;
      const { error: movementError } = await supabase.from('inventory_movements').insert({
        baker_id: bakerId,
        ingredient_id: ingredientId,
        movement_type: 'usage' satisfies MovementType,
        quantity_change: signedAmount,
        resulting_stock: runningStock,
        reference_type: 'order_item',
        reference_id: entry.orderItemId,
        note: direction === 'deduct' ? 'Used in production' : 'Production undone',
      });
      if (movementError) throw movementError;
    }
  }
}

const WASTE_REASONS: readonly UseWasteReason[] = ['Wasted', 'Spoiled'];

/**
 * Records "Used in production" as a `usage` movement, or "Wasted"/
 * "Spoiled" as a `waste` movement — the exact reason label is stored in
 * `note` so Stock History can show it verbatim. Never touches
 * cost_per_unit: using or wasting stock doesn't change what the
 * remaining stock is worth per unit.
 */
export async function recordUseOrWaste(
  id: string,
  quantity: number,
  reason: UseWasteReason
): Promise<Ingredient> {
  const bakerId = await getCurrentBakerId();
  const existing = await getIngredient(id);
  const newStock = existing.current_stock - quantity;

  const movementType: MovementType = WASTE_REASONS.includes(reason) ? 'waste' : 'usage';

  const { data, error } = await supabase
    .from('ingredients')
    .update({ current_stock: newStock })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  const { error: movementError } = await supabase.from('inventory_movements').insert({
    baker_id: bakerId,
    ingredient_id: id,
    movement_type: movementType,
    quantity_change: -quantity,
    resulting_stock: newStock,
    reference_type: 'manual',
    note: reason,
  });
  if (movementError) throw movementError;

  return data as Ingredient;
}
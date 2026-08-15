import { supabase } from './supabase';
import type { Ingredient, InventoryMovement, MovementType } from '../types/ingredient';
import type { IngredientFormInput, RestockFormInput, UseWasteReason } from '../utils/validation/ingredientSchemas';

export async function getIngredients(): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
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

/**
 * Deletes an ingredient. Will throw if the ingredient is referenced by
 * any recipe_ingredients row — the DB enforces this via `on delete
 * restrict` (see supabase/migrations/0002_phase3_core_tables.sql).
 * Callers should catch this and show the plain-language message from the
 * Phase 5 spec rather than a raw Postgres error.
 */
export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await supabase.from('ingredients').delete().eq('id', id);
  if (error) throw error;
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

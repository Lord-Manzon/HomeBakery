export type IngredientCategory =
  | 'Dry goods'
  | 'Dairy'
  | 'Flavoring'
  | 'Packaging'
  | 'Other';

export const INGREDIENT_CATEGORIES: IngredientCategory[] = [
  'Dry goods',
  'Dairy',
  'Flavoring',
  'Packaging',
  'Other',
];

export type IngredientUnit = 'kg' | 'g' | 'pcs' | 'L' | 'ml' | 'bottle' | 'box';

export const INGREDIENT_UNITS: IngredientUnit[] = ['kg', 'g', 'pcs', 'L', 'ml', 'bottle', 'box'];

export type Ingredient = {
  id: string;
  baker_id: string;
  name: string;
  category: string | null;
  unit: string;
  current_stock: number;
  cost_per_unit: number;
  low_stock_threshold: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MovementType = 'restock' | 'usage' | 'adjustment' | 'waste';

export type InventoryMovement = {
  id: string;
  baker_id: string;
  ingredient_id: string;
  movement_type: MovementType;
  quantity_change: number;
  resulting_stock: number;
  reference_type: 'order_item' | 'manual' | null;
  reference_id: string | null;
  note: string | null;
  created_at: string;
};

/** True when current_stock is at or below low_stock_threshold. */
export function isLowStock(ingredient: Ingredient): boolean {
  if (ingredient.low_stock_threshold == null) return false;
  return ingredient.current_stock <= ingredient.low_stock_threshold;
}

import type { Ingredient } from './ingredient';

export type Recipe = {
  id: string;
  baker_id: string;
  name: string;
  yield_quantity: number;
  yield_unit: string;
  /** Array of step strings, jsonb in the DB. A "one block" recipe is
   * just a 1-item array — see docs/DECISIONS.md's 2026-08-21 entry. */
  instructions: string[] | null;
  margin_percent: number | null;
  created_at: string;
  updated_at: string;
};

export type RecipeIngredient = {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
};

/** A recipe_ingredients row with its ingredient's cost/unit attached —
 * the shape costing.ts needs to compute a batch cost without a second
 * round trip per ingredient. */
export type RecipeIngredientWithDetails = RecipeIngredient & {
  ingredient: Pick<Ingredient, 'id' | 'name' | 'unit' | 'cost_per_unit'>;
};

export type RecipeWithIngredients = Recipe & {
  ingredients: RecipeIngredientWithDetails[];
};

/** Minimal shape costing.ts's calculateRecipeBatchCost actually needs —
 * kept narrow so a test can build one without a full Recipe object. */
export type RecipeForCosting = {
  ingredients: { quantity: number; ingredient: { cost_per_unit: number } }[];
};

/** Minimal shape resolveMarginPercent needs from a recipe — separate
 * from RecipeForCosting since margin resolution and batch-cost
 * calculation use genuinely different fields. */
export type RecipeMargin = {
  margin_percent: number | null;
};

/** Minimal shape costing.ts needs from a product_variant for cost/margin
 * calculations — narrower than the full ProductVariant type in
 * src/types/product.ts. */
export type VariantForCosting = {
  recipe_portion: number | null;
  packaging_cost: number;
  margin_percent: number | null;
};

export type ProductWithMargin = {
  margin_percent: number | null;
};

/** Which variants (across all products) currently link to a given
 * recipe — shown on the standalone Recipe detail screen so a baker can
 * see everywhere a recipe is used, per the "Product = what I sell,
 * Recipe = how I make it" reuse model (docs/DECISIONS.md, 2026-08-18). */
export type RecipeUsage = {
  variant_id: string;
  variant_name: string;
  product_id: string;
  product_name: string;
};

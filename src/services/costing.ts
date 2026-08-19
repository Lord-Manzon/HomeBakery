import type { Baker } from '../types/baker';
import type { ProductWithMargin, RecipeForCosting, RecipeMargin, VariantForCosting } from '../types/recipe';

/**
 * Margin resolution order per docs/DATABASE.md and docs/DECISIONS.md's
 * 2026-08-12 entry (first one *set* wins, not first one truthy — a margin
 * of 0 is a deliberate choice, not "unset"):
 *   variant.margin_percent -> product.margin_percent
 *     -> recipe.margin_percent -> baker.default_margin_percent
 */
export function resolveMarginPercent(
  variant: Pick<VariantForCosting, 'margin_percent'>,
  product: Pick<ProductWithMargin, 'margin_percent'> | null,
  recipe: Pick<RecipeMargin, 'margin_percent'> | null,
  baker: Pick<Baker, 'default_margin_percent'>
): number {
  if (variant.margin_percent != null) return variant.margin_percent;
  if (product?.margin_percent != null) return product.margin_percent;
  if (recipe?.margin_percent != null) return recipe.margin_percent;
  return baker.default_margin_percent;
}

/**
 * Total ingredient cost for one FULL batch of a recipe (i.e. yield_quantity
 * worth), not scaled to any variant's portion. Sum of each recipe_ingredient's
 * quantity × its ingredient's cost_per_unit.
 *
 * Unit conversion is explicitly NOT handled — per docs/DATABASE.md's "Open
 * questions for later phases," MVP requires the recipe_ingredient's unit to
 * already match the ingredient's stock unit. If a recipe was built with a
 * mismatched unit, this will silently produce a wrong number rather than
 * throwing — that's a real limitation, not a bug in this function.
 */
export function calculateRecipeBatchCost(recipe: RecipeForCosting): number {
  return recipe.ingredients.reduce(
    (total, ri) => total + ri.quantity * ri.ingredient.cost_per_unit,
    0
  );
}

/**
 * Cost of ONE variant's portion of a recipe batch, plus its own packaging
 * cost. recipe_portion is "how much of one full batch this variant uses"
 * (e.g. 0.25 = a quarter of the batch), per docs/DATABASE.md.
 */
export function calculateVariantCost(
  recipe: RecipeForCosting | null,
  variant: Pick<VariantForCosting, 'recipe_portion' | 'packaging_cost'>
): number {
  if (!recipe || variant.recipe_portion == null) return variant.packaging_cost;
  const batchCost = calculateRecipeBatchCost(recipe);
  const ingredientCost = batchCost * variant.recipe_portion;
  return ingredientCost + variant.packaging_cost;
}

/**
 * suggested_price = cost ÷ (1 − margin%), per docs/PRODUCT.md. Margin is
 * stored as a whole-number percent (e.g. 30 = 30%), not a fraction.
 *
 * A margin of 100 (or above) would divide by zero or go negative — treated
 * as "can't price this," returning null rather than Infinity/a negative
 * number a baker might mistake for a real suggestion. The UI should show
 * "Enter a margin below 100%" rather than a suggested price in that case.
 */
export function calculateSuggestedPrice(cost: number, marginPercent: number): number | null {
  if (marginPercent >= 100) return null;
  const divisor = 1 - marginPercent / 100;
  if (divisor <= 0) return null;
  return cost / divisor;
}

/**
 * Actual profit at the variant's own selling_price (which the baker may
 * have manually overridden away from suggested_price — see
 * docs/PRODUCT.md: "the baker can also always override the final
 * suggested price manually, regardless of margin"). This is what the
 * Recipe & costing screen's "profit" figure and negative-margin danger
 * color are driven from, NOT the suggested price.
 */
export function calculateProfit(sellingPrice: number, cost: number): number {
  return sellingPrice - cost;
}

/** Actual margin % realized at the variant's current selling_price — for
 * display next to the target margin, so a baker can see "what I set" vs.
 * "what I'm actually getting" if they've overridden the price. */
export function calculateActualMarginPercent(sellingPrice: number, cost: number): number | null {
  if (sellingPrice <= 0) return null;
  return ((sellingPrice - cost) / sellingPrice) * 100;
}

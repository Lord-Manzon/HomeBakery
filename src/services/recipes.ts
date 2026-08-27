import { supabase } from './supabase';
import type {
  Recipe,
  RecipeIngredient,
  RecipeUsage,
  RecipeWithIngredients,
} from '../types/recipe';
import type { RecipeFormInput, RecipeIngredientFormInput } from '../utils/validation/recipeSchemas';

async function getCurrentBakerId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error('No authenticated user.');
  return id;
}

export async function getRecipes(): Promise<(Recipe & { used_in_count: number })[]> {
  const bakerId = await getCurrentBakerId();
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
      used_in_count:product_variants(count)
    `)
    .eq('baker_id', bakerId)
    .eq('product_variants.is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;

  return (data as any[]).map((r) => ({
    ...r,
    used_in_count: r.used_in_count?.[0]?.count ?? 0,
  }));
}

/**
 * A recipe with its ingredients joined against `ingredients` for
 * name/unit/cost_per_unit — the shape src/services/costing.ts needs to
 * compute a batch cost in one round trip, and what the Recipe detail
 * screen renders directly (no separate ingredient list fetch).
 */
export async function getRecipeWithIngredients(id: string): Promise<RecipeWithIngredients> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*, ingredient:ingredients(id, name, unit, cost_per_unit, category))')
    .eq('id', id)
    .single();
  if (error) throw error;

  const { recipe_ingredients, ...recipe } = data as Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: unknown })[];
  };
  return {
    ...recipe,
    ingredients: (recipe_ingredients ?? []) as RecipeWithIngredients['ingredients'],
  };
}

/**
 * Every product variant (across all products) currently linked to this
 * recipe — powers the standalone Recipe detail screen's "used in" list,
 * per the Product/Recipe separation decided 2026-08-18 (a recipe should
 * show everywhere it's reused, not just from one product's context).
 */
export async function getRecipeUsage(recipeId: string): Promise<RecipeUsage[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, name, product:products(id, name)')
    .eq('recipe_id', recipeId)
    .eq('is_active', true);
  if (error) throw error;

  type RawRow = { id: string; name: string; product: { id: string; name: string } | { id: string; name: string }[] | null };
  return (data as unknown as RawRow[])
    .map((v) => ({ ...v, product: Array.isArray(v.product) ? v.product[0] ?? null : v.product }))
    .filter((v): v is RawRow & { product: { id: string; name: string } } => v.product != null)
    .map((v) => ({
      variant_id: v.id,
      variant_name: v.name,
      product_id: v.product.id,
      product_name: v.product.name,
    }));
}

export async function createRecipe(input: RecipeFormInput): Promise<Recipe> {
  const bakerId = await getCurrentBakerId();
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      baker_id: bakerId,
      name: input.name,
      yield_quantity: input.yield_quantity,
      yield_unit: input.yield_unit,
      intro: input.intro ?? null,
      instructions: input.instructions ?? null,
      margin_percent: input.margin_percent ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Recipe;
}

export async function updateRecipe(id: string, input: RecipeFormInput): Promise<Recipe> {
  const { data, error } = await supabase
    .from('recipes')
    .update({
      name: input.name,
      yield_quantity: input.yield_quantity,
      yield_unit: input.yield_unit,
      intro: input.intro ?? null,
      instructions: input.instructions ?? null,
      margin_percent: input.margin_percent ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Recipe;
}

/**
 * Real delete, not a soft-delete — `recipes` has no `is_active` column
 * (same as `expenses`, per docs/DATABASE.md). Any product_variant linked
 * to this recipe has its `recipe_id` set to null automatically (FK is
 * `on delete set null`), so deleting a recipe never breaks a product —
 * it just un-links it, and the variant's cost falls back to packaging
 * cost only until a new recipe is linked. Always confirm before calling
 * this — see UI_UX_1.md's inline-confirm pattern.
 */
export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

export async function addRecipeIngredient(
  recipeId: string,
  input: RecipeIngredientFormInput
): Promise<RecipeIngredient> {
  const { data, error } = await supabase
    .from('recipe_ingredients')
    .insert({
      recipe_id: recipeId,
      ingredient_id: input.ingredient_id,
      quantity: input.quantity,
      unit: input.unit,
    })
    .select()
    .single();
  if (error) throw error;
  return data as RecipeIngredient;
}

export async function updateRecipeIngredient(
  id: string,
  input: RecipeIngredientFormInput
): Promise<RecipeIngredient> {
  const { data, error } = await supabase
    .from('recipe_ingredients')
    .update({ ingredient_id: input.ingredient_id, quantity: input.quantity, unit: input.unit })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as RecipeIngredient;
}

export async function removeRecipeIngredient(id: string): Promise<void> {
  const { error } = await supabase.from('recipe_ingredients').delete().eq('id', id);
  if (error) throw error;
}

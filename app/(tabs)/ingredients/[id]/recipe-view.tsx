import { useLocalSearchParams } from 'expo-router';
import { RecipeDetailScreen } from '../../../../src/screens/RecipeDetailScreen';

/**
 * Same reasoning as products/[id]/recipe-view.tsx — lets Ingredient
 * Detail's "Used in" chips (and the "can't remove, used in..." notice)
 * open a recipe without leaving the Ingredients tab's own stack, so
 * back returns to this exact ingredient instead of falling through to
 * Home.
 */
export default function IngredientRecipeViewRoute() {
  const { id, recipeId } = useLocalSearchParams<{ id: string; recipeId: string }>();
  return (
    <RecipeDetailScreen
      recipeId={recipeId}
      instructionsPath={`/ingredients/${id}/recipe-instructions?recipeId=${recipeId}`}
      // Known remaining limitation: this still jumps into the Products
      // tab directly (cross-tab), same as the original bug this whole
      // change was fixing — Ingredient → Recipe → Product is one hop
      // deeper than what's been fixed so far. Not addressed here; would
      // need an equivalent nested product-view route under Ingredients.
      productPath={(productId) => `/products/${productId}`}
    />
  );
}

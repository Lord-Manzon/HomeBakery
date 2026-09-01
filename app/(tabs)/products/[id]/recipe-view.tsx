import { useLocalSearchParams } from 'expo-router';
import { RecipeDetailScreen } from '../../../../src/screens/RecipeDetailScreen';

/**
 * Lets "Recipe & costing" (./recipe.tsx) open the linked recipe's full
 * detail screen WITHOUT leaving the Products tab's own stack. Before
 * this route existed, that link pushed straight to `/recipes/[id]` —
 * a screen that lives in the (separate) Recipes tab — which is a tab
 * switch, not a normal push: back from there popped that fresh Recipes
 * stack to empty and fell through to Home, skipping Products and the
 * specific product the baker actually came from entirely.
 *
 * recipeId travels as a query param rather than a second dynamic
 * segment (`[id]/recipe-view/[recipeId]`) so this stays a flat file
 * alongside recipe.tsx, matching how this folder already does things —
 * no new nested layout/Stack needed for one more path segment.
 */
export default function ProductRecipeViewRoute() {
  const { id, recipeId } = useLocalSearchParams<{ id: string; recipeId: string }>();
  return (
    <RecipeDetailScreen
      recipeId={recipeId}
      instructionsPath={`/products/${id}/recipe-instructions?recipeId=${recipeId}`}
      // Already inside the Products tab, so a product link here is a
      // normal same-tab push to the tab's own native product route —
      // no special nested route needed, unlike the Recipes-tab case.
      productPath={(productId) => `/products/${productId}`}
    />
  );
}

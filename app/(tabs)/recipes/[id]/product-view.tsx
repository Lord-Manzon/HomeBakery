import { useLocalSearchParams } from 'expo-router';
import { ProductDetailScreen } from '../../../../src/screens/ProductDetailScreen';

/**
 * Lets a recipe's "Used in" list open a product WITHOUT leaving the
 * Recipes tab's own stack. Before this route existed, that link pushed
 * straight to `/products/[id]` — a screen that lives in the (separate)
 * Products tab — a tab switch, not a normal push: back from there
 * popped that fresh Products stack to empty and fell through to Home,
 * skipping the recipe the baker actually came from entirely.
 *
 * productId travels as a query param, same reasoning as recipeId does
 * in products/[id]/recipe-view.tsx — keeps this a flat file alongside
 * the recipe's own [id]/index.tsx and instructions.tsx.
 *
 * Tapping "Recipe & costing" from a product viewed this way still
 * jumps into the Products tab directly (recipeAndCostingPath below) —
 * a known, unfixed edge case one hop deeper than what this route
 * solves. Chasing it further would mean nesting a THIRD level of
 * wrapper routes for a path (Recipe → Product → Recipe & Costing) that
 * hasn't actually been reported as a problem yet.
 */
export default function RecipeProductViewRoute() {
  const { id, productId } = useLocalSearchParams<{ id: string; productId: string }>();
  return (
    <ProductDetailScreen
      productId={productId}
      recipeAndCostingPath={(variantId) => `/products/${productId}/recipe?variantId=${variantId}`}
    />
  );
}

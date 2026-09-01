import { useLocalSearchParams } from 'expo-router';
import { ProductDetailScreen } from '../../../../src/screens/ProductDetailScreen';

/**
 * Thin route wrapper — the actual screen lives in
 * src/screens/ProductDetailScreen.tsx and is shared with the nested
 * wrapper route under Recipes (`recipes/[id]/product-view`). See that
 * file's top comment for why. This is the Products tab's own native
 * entry point, so the Recipe & Costing link just points at its own
 * sibling route.
 */
export default function ProductDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ProductDetailScreen
      productId={id}
      recipeAndCostingPath={(variantId) => `/products/${id}/recipe?variantId=${variantId}`}
    />
  );
}

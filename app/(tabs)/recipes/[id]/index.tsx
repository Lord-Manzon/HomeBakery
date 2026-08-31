import { useLocalSearchParams } from 'expo-router';
import { RecipeDetailScreen } from '../../../../src/screens/RecipeDetailScreen';

/**
 * Thin route wrapper — the actual screen lives in
 * src/screens/RecipeDetailScreen.tsx and is shared with the equivalent
 * wrapper routes nested under Products (`products/[id]/recipe-view`)
 * and Ingredients (`ingredients/[id]/recipe-view`). See that file's
 * top comment for why. This is the Recipes tab's own native entry
 * point, so basePath just points back at itself.
 */
export default function RecipeDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecipeDetailScreen recipeId={id} basePath={`/recipes/${id}`} />;
}

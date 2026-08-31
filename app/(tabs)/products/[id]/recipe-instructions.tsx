import { useLocalSearchParams } from 'expo-router';
import { RecipeInstructionsScreen } from '../../../../src/screens/RecipeInstructionsScreen';

/**
 * Reached only from ./recipe-view.tsx's "Edit instructions" link — see
 * that file's basePath comment. Same recipeId-as-query-param reasoning.
 */
export default function ProductRecipeInstructionsRoute() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  return <RecipeInstructionsScreen recipeId={recipeId} />;
}

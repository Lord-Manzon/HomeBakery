import { useLocalSearchParams } from 'expo-router';
import { RecipeInstructionsScreen } from '../../../../src/screens/RecipeInstructionsScreen';

/**
 * Reached only from ./recipe-view.tsx's "Edit instructions" link.
 */
export default function IngredientRecipeInstructionsRoute() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  return <RecipeInstructionsScreen recipeId={recipeId} />;
}

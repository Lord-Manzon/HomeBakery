import { useLocalSearchParams } from 'expo-router';
import { RecipeInstructionsScreen } from '../../../../src/screens/RecipeInstructionsScreen';

/**
 * Thin route wrapper — see RecipeInstructionsScreen.tsx's top comment.
 */
export default function RecipeInstructionsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecipeInstructionsScreen recipeId={id} />;
}

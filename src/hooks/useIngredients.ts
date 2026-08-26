import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createIngredient,
  getIngredient,
  getIngredients,
  getMovementHistory,
  getRecipesUsingIngredient,
  getTodayUsage,
  recordUseOrWaste,
  removeIngredient,
  restockIngredient,
  updateIngredient,
} from '../services/ingredients';
import type { IngredientFormInput, RestockFormInput, UseWasteReason } from '../utils/validation/ingredientSchemas';

const ingredientsKey = ['ingredients'] as const;
const ingredientKey = (id: string) => ['ingredients', id] as const;
const movementsKey = (id: string) => ['ingredients', id, 'movements'] as const;
const todayUsageKey = ['ingredients', 'todayUsage'] as const;

export function useIngredients() {
  return useQuery({ queryKey: ingredientsKey, queryFn: getIngredients });
}

/**
 * Today's usage+waste totals per ingredient (see getTodayUsage for the
 * "local calendar day" definition). Invalidated alongside ingredientsKey
 * on every mutation below that can change it, so the card badge updates
 * immediately after Save — same pattern as the rest of this file.
 */
export function useTodayUsage() {
  return useQuery({ queryKey: todayUsageKey, queryFn: getTodayUsage });
}

export function useIngredient(id: string) {
  return useQuery({ queryKey: ingredientKey(id), queryFn: () => getIngredient(id), enabled: !!id });
}

export function useMovementHistory(id: string) {
  return useQuery({ queryKey: movementsKey(id), queryFn: () => getMovementHistory(id), enabled: !!id });
}

const recipesUsingKey = (id: string) => ['ingredients', id, 'recipes'] as const;

export function useIngredientRecipes(id: string) {
  return useQuery({
    queryKey: recipesUsingKey(id),
    queryFn: () => getRecipesUsingIngredient(id),
    enabled: !!id,
  });
}

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IngredientFormInput) => createIngredient(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ingredientsKey });
    },
  });
}

export function useUpdateIngredient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IngredientFormInput) => updateIngredient(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(ingredientKey(id), data);
      queryClient.invalidateQueries({ queryKey: ingredientsKey });
      queryClient.invalidateQueries({ queryKey: movementsKey(id) });
    },
  });
}

export function useRemoveIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeIngredient(id),
    onSuccess: (result) => {
      // Both a real delete AND an archive remove the ingredient from the
      // active list — invalidating ingredientsKey covers either outcome.
      // A 'blocked' result changes nothing server-side, so there's
      // nothing to invalidate for that case.
      if (result.action !== 'blocked') {
        queryClient.invalidateQueries({ queryKey: ingredientsKey });
      }
    },
  });
}

export function useRestockIngredient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RestockFormInput) => restockIngredient(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(ingredientKey(id), data);
      queryClient.invalidateQueries({ queryKey: ingredientsKey });
      queryClient.invalidateQueries({ queryKey: movementsKey(id) });
    },
  });
}

export function useRecordUseOrWaste(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quantity, reason }: { quantity: number; reason: UseWasteReason }) =>
      recordUseOrWaste(id, quantity, reason),
    onSuccess: (data) => {
      queryClient.setQueryData(ingredientKey(id), data);
      queryClient.invalidateQueries({ queryKey: ingredientsKey });
      queryClient.invalidateQueries({ queryKey: movementsKey(id) });
      queryClient.invalidateQueries({ queryKey: todayUsageKey });
    },
  });
}
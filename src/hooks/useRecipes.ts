import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addRecipeIngredient,
  createRecipe,
  deleteRecipe,
  getRecipeUsage,
  getRecipeWithIngredients,
  getRecipes,
  removeRecipeIngredient,
  updateRecipe,
  updateRecipeIngredient,
} from '../services/recipes';
import type { RecipeFormInput, RecipeIngredientFormInput } from '../utils/validation/recipeSchemas';

const recipesKey = ['recipes'] as const;
const recipeKey = (id: string) => ['recipes', id] as const;
const recipeUsageKey = (id: string) => ['recipes', id, 'usage'] as const;

export function useRecipes() {
  return useQuery({ queryKey: recipesKey, queryFn: getRecipes });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKey(id),
    queryFn: () => getRecipeWithIngredients(id),
    enabled: !!id,
  });
}

export function useRecipeUsage(id: string) {
  return useQuery({
    queryKey: recipeUsageKey(id),
    queryFn: () => getRecipeUsage(id),
    enabled: !!id,
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeFormInput) => createRecipe(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipesKey }),
  });
}

export function useUpdateRecipe(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeFormInput) => updateRecipe(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKey(id) });
      queryClient.invalidateQueries({ queryKey: recipesKey });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecipe(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipesKey }),
  });
}

export function useAddRecipeIngredient(recipeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeIngredientFormInput) => addRecipeIngredient(recipeId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKey(recipeId) }),
  });
}

export function useUpdateRecipeIngredient(recipeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecipeIngredientFormInput }) =>
      updateRecipeIngredient(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKey(recipeId) }),
  });
}

export function useRemoveRecipeIngredient(recipeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeRecipeIngredient(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKey(recipeId) }),
  });
}

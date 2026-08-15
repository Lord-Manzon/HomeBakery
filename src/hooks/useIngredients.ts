import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createIngredient,
  deleteIngredient,
  getIngredient,
  getIngredients,
  getMovementHistory,
  recordUseOrWaste,
  restockIngredient,
  updateIngredient,
} from '../services/ingredients';
import type { IngredientFormInput, RestockFormInput, UseWasteReason } from '../utils/validation/ingredientSchemas';

const ingredientsKey = ['ingredients'] as const;
const ingredientKey = (id: string) => ['ingredients', id] as const;
const movementsKey = (id: string) => ['ingredients', id, 'movements'] as const;

export function useIngredients() {
  return useQuery({ queryKey: ingredientsKey, queryFn: getIngredients });
}

export function useIngredient(id: string) {
  return useQuery({ queryKey: ingredientKey(id), queryFn: () => getIngredient(id), enabled: !!id });
}

export function useMovementHistory(id: string) {
  return useQuery({ queryKey: movementsKey(id), queryFn: () => getMovementHistory(id), enabled: !!id });
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

export function useDeleteIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteIngredient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ingredientsKey });
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
    },
  });
}

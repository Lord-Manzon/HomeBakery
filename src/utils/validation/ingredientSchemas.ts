import { z } from 'zod';
import { INGREDIENT_CATEGORIES, INGREDIENT_UNITS } from '../../types/ingredient';

/**
 * A factory, not a static schema — same pattern as useWasteFormSchema()
 * below — because the duplicate-name check needs the baker's current
 * ingredient list at validation time, which a plain static schema has
 * no way to know. `existingNames` should already exclude the ingredient
 * being edited (see IngredientFormSheet.tsx), so saving an Edit without
 * changing the name doesn't flag itself as a duplicate of itself.
 */
export function ingredientFormSchema(existingNames: string[] = []) {
  const normalizedExisting = new Set(existingNames.map((n) => n.trim().toLowerCase()));

  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name is too long')
      .refine((n) => !normalizedExisting.has(n.toLowerCase()), {
        message: 'You already have an ingredient with this name',
      }),
    category: z.enum(INGREDIENT_CATEGORIES as [string, ...string[]]).optional().nullable(),
    quantity: z.coerce.number().min(0, 'Quantity can\'t be negative'),
    unit: z.enum(INGREDIENT_UNITS as [string, ...string[]], {
      message: 'Choose a unit',
    }),
    lowStockThreshold: z.coerce.number().min(0, 'Can\'t be negative').optional().nullable(),
  });
}
export type IngredientFormInput = z.infer<ReturnType<typeof ingredientFormSchema>>;

export const restockFormSchema = z.object({
  quantity: z.coerce.number().positive('Enter a quantity above 0'),
  totalCostPaid: z.coerce.number().min(0, 'Can\'t be negative').optional().nullable(),
});
export type RestockFormInput = z.infer<typeof restockFormSchema>;

export const USE_WASTE_REASONS = ['Used in production', 'Wasted', 'Spoiled'] as const;
export type UseWasteReason = (typeof USE_WASTE_REASONS)[number];

export function useWasteFormSchema(currentStock: number) {
  return z.object({
    quantity: z
      .coerce.number()
      .positive('Enter a quantity above 0')
      .max(currentStock, `Not enough stock — you have ${currentStock} left`),
    reason: z.enum(USE_WASTE_REASONS, {
      message: 'Choose a reason',
    }),
  });
}
export type UseWasteFormInput = z.infer<ReturnType<typeof useWasteFormSchema>>;
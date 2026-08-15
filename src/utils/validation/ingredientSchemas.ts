import { z } from 'zod';
import { INGREDIENT_CATEGORIES, INGREDIENT_UNITS } from '../../types/ingredient';

export const ingredientFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  category: z.enum(INGREDIENT_CATEGORIES as [string, ...string[]]).optional().nullable(),
  quantity: z.coerce.number().min(0, 'Quantity can\'t be negative'),
  unit: z.enum(INGREDIENT_UNITS as [string, ...string[]], {
    message: 'Choose a unit',
  }),
  lowStockThreshold: z.coerce.number().min(0, 'Can\'t be negative').optional().nullable(),
});
export type IngredientFormInput = z.infer<typeof ingredientFormSchema>;

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
 import { z } from 'zod';

export const recipeFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  yield_quantity: z.coerce
    .number()
    .positive('Enter a yield above 0'),
  yield_unit: z
    .string()
    .trim()
    .min(1, 'Yield unit is required')
    .max(30, 'Too long')
    .refine((v) => Number.isNaN(Number(v)), {
      message: "This looks like a quantity — try 'rolls' or '8-inch cake' instead",
    }),
  instructions: z.string().trim().max(4000, 'Instructions are too long').optional().or(z.literal('')).transform((v) => (v ? v : null)).nullable(),
  // Optional recipe-level margin override — resolution order in
  // src/services/costing.ts's resolveMarginPercent. null/omitted means
  // "fall through to the baker default (or product/variant override)."
  margin_percent: z.coerce
    .number()
    .min(0, "Can't be negative")
    .max(99, 'Must be below 100%')
    .optional()
    .nullable(),
});
export type RecipeFormInput = z.infer<typeof recipeFormSchema>;

export const recipeIngredientFormSchema = z.object({
  ingredient_id: z.string().min(1, 'Choose an ingredient'),
  quantity: z.coerce.number().positive('Enter a quantity above 0'),
  // Free text, not constrained to the ingredient's own unit list — a
  // recipe may reasonably call for a different unit than the ingredient's
  // stock unit (e.g. stock in kg, recipe calls for grams). Per
  // docs/DATABASE.md's open question, MVP does NOT convert between them;
  // the baker is responsible for entering a quantity in whichever unit
  // they intend, and costing.ts assumes it already matches the
  // ingredient's cost_per_unit basis.
  unit: z.string().trim().min(1, 'Unit is required').max(20, 'Too long'),
});
export type RecipeIngredientFormInput = z.infer<typeof recipeIngredientFormSchema>;

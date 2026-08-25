import { z } from 'zod';

// One instruction step. duration_minutes/temperature_celsius are
// optional — most steps won't have either (see docs/DECISIONS.md's
// 2026-08-25 entry). Bounds are generous but not unlimited: a step
// lasting more than ~7 days or a temperature outside any real kitchen/
// oven range is almost certainly a typo, not a real value.
const recipeStepSchema = z.object({
  text: z.string().trim().min(1).max(2000, 'That step is too long \u2014 try splitting it up'),
  duration_minutes: z.coerce
    .number()
    .int('Whole minutes only')
    .positive('Enter a duration above 0')
    .max(10080, "That's more than a week \u2014 double check this")
    .optional()
    .nullable(),
  temperature_celsius: z.coerce
    .number()
    .min(-50, 'That temperature looks off')
    .max(500, 'That temperature looks off')
    .optional()
    .nullable(),
});

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
  // Each element is one step in "Steps" mode, or the whole thing in "One
  // block" mode — so a single element's text needs room for a full
  // paragraph, not just a short instruction. The 4000-char total cap
  // matches the old single-text-field limit it replaces; per-element is
  // generous enough for "one block" while still catching a genuinely
  // runaway paste.
  instructions: z
    .array(recipeStepSchema)
    .max(50, 'That\u2019s a lot of steps \u2014 consider splitting into two recipes')
    .refine((arr) => arr.reduce((sum, s) => sum + s.text.length, 0) <= 4000, {
      message: 'Instructions are too long overall (4000 characters max)',
    })
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
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
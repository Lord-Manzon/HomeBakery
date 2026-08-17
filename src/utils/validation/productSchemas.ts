import { z } from 'zod';

// Category is free text, no fixed list — per docs/DECISIONS.md's
// 2026-08-17 entry ("Reopened: product categories are now MVP"). Only
// length is validated; the Products list derives its filter chips
// dynamically from whatever distinct values exist, not from this schema.
export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  category: z
    .string()
    .trim()
    .max(50, 'Category is too long')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null))
    .nullable(),
  image_url: z.string().url().optional().nullable(),
});
export type ProductFormInput = z.infer<typeof productFormSchema>;

// Per docs/UI_UX_1.md section E.5c: recipe linkage, recipe_portion, and
// suggested_price are NOT in this sheet — those are set later inside
// Recipe & costing once Phase 6 exists. suggested_price is never
// hand-typed, it's a calculated value.
export const variantFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  selling_price: z.coerce
    .number()
    .positive('Enter a price above ₱0')
    .multipleOf(0.01, 'Use at most 2 decimal places'),
  packaging_cost: z.coerce
    .number()
    .min(0, "Can't be negative")
    .optional()
    .default(0),
});
export type VariantFormInput = z.infer<typeof variantFormSchema>;

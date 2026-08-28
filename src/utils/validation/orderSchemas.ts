import { z } from 'zod';

// One line item: which variant, and how many. unit_price is deliberately
// NOT here -- like suggested_price on the product form, it's never
// hand-typed. src/services/orders.ts re-fetches each variant's current
// selling_price at save time rather than trusting whatever the New Order
// screen had cached when the baker picked it (see that file's comments).
export const orderItemFormSchema = z.object({
  // Present when this item already exists on the order being edited
  // (carried through from OrderForm's initial hydration), absent for an
  // item newly added during this edit. src/services/orders.ts's
  // updateOrder uses this to update existing rows IN PLACE instead of
  // deleting and recreating every item on every save -- see that file's
  // comments for why (it's what keeps a checked-off Production row, and
  // any inventory_movements pointing at it, from being silently orphaned
  // by an unrelated order edit).
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  quantity: z.coerce.number().positive('Enter a quantity above 0'),
});
export type OrderItemFormInput = z.infer<typeof orderItemFormSchema>;

// Per docs/DECISIONS.md's 2026-08-22 entry: multiple items per order are
// supported (order_items already modeled this; the New Order screen now
// actually exposes it). At least one item is required -- an order with
// nothing in it isn't a real order.
export const orderFormSchema = z
  .object({
    customer_name: z.string().trim().min(1, 'Customer name is required').max(100, 'Name is too long'),
    customer_contact: z
      .string()
      .trim()
      .max(100, 'Contact info is too long')
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : null))
      .nullable(),
    fulfillment_type: z.enum(['pickup', 'delivery'], {
      message: 'Choose pickup or delivery',
    }),
    // Required only for delivery -- enforced below in superRefine rather
    // than here, since the field's own type has to allow being empty for
    // pickup orders.
    delivery_address: z
      .string()
      .trim()
      .max(200, 'Address is too long')
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : null))
      .nullable(),
    delivery_fee: z.coerce.number().min(0, "Can't be negative").optional().default(0),
    // Postgres `date` as "YYYY-MM-DD" -- produced by the native date
    // picker, never hand-typed, so free-text format validation isn't
    // needed here.
    scheduled_date: z.string().min(1, 'Pick a date'),
    scheduled_time: z
      .string()
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : null))
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(500, 'Notes are too long')
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : null))
      .nullable(),
    items: z.array(orderItemFormSchema).min(1, 'Add at least one item'),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillment_type === 'delivery' && !data.delivery_address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['delivery_address'],
        message: 'Enter a delivery address',
      });
    }
  });
export type OrderFormInput = z.infer<typeof orderFormSchema>;

/**
 * Curated quick-pick chips for the "Mark Paid" action -- NOT a DB
 * constraint (see docs/DECISIONS.md's 2026-08-22 entry). "Other" lets the
 * baker type something not on this list, so a payment app outside this
 * set (e.g. Venmo, a local wallet app) doesn't need a schema change to be
 * recorded. "Cash" is first since it's the default per that same entry.
 */
export const PAYMENT_METHOD_OPTIONS = ['Cash', 'GCash', 'Bank Transfer', 'PayPal'] as const;
export const DEFAULT_PAYMENT_METHOD = 'Cash';

export const paymentMethodFormSchema = z
  .string()
  .trim()
  .min(1, 'Choose or enter a payment method')
  .max(50, 'Payment method is too long');
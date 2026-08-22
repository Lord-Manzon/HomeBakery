import type { OrderStatus } from '../types/order';

/**
 * subtotal = sum of every item's quantity × unit_price. total = subtotal +
 * delivery_fee. Per docs/DATABASE.md, both are "computed from order items
 * + delivery fee at save time" and stored on the order row rather than
 * derived live on every read -- this is the one place that computation
 * happens, so both create and update go through it.
 */
export function calculateOrderTotals(
  items: { quantity: number; unit_price: number }[],
  deliveryFee: number
): { subtotal: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  return { subtotal, total: subtotal + deliveryFee };
}

/**
 * The order lifecycle after docs/DECISIONS.md's 2026-08-22 simplification:
 * pending -> delivered -> completed, or cancelled (from pending or
 * delivered, not from completed). 'completed' is never set directly by a
 * baker action -- it's always a side effect of BOTH delivered and paid
 * being true, whichever happens last. This function only decides the
 * resulting `status`; `payment_status` is a separate column the caller
 * (src/services/orders.ts) sets alongside this in the same update.
 */
export function resolveStatusAfterMarking(input: {
  action: 'delivered' | 'paid';
  currentStatus: OrderStatus;
  /** payment_status.paid value the order WILL have after this action --
   * true if action is 'paid', otherwise whatever it already was. */
  willBePaid: boolean;
}): OrderStatus {
  if (input.currentStatus === 'completed' || input.currentStatus === 'cancelled') {
    return input.currentStatus;
  }

  const willBeDelivered = input.action === 'delivered' || input.currentStatus === 'delivered';

  if (willBeDelivered && input.willBePaid) return 'completed';
  if (input.action === 'delivered') return 'delivered';
  return input.currentStatus;
}

/**
 * Cancel is only offered from the two "in-flight" states -- an order
 * that's already Completed shouldn't be cancellable after the fact (per
 * docs/PRODUCT.md's status list), and an already-Cancelled order has
 * nothing left to cancel.
 */
export function canCancelOrder(status: OrderStatus): boolean {
  return status === 'pending' || status === 'delivered';
}

/**
 * "Active" = still in flight, i.e. not Completed and not Cancelled. This
 * is what the Orders list's default view and its Today/Upcoming/Unpaid
 * filter chips are scoped to -- per docs/DECISIONS.md's 2026-08-22 entry,
 * "All" is the one chip that also surfaces Completed/Cancelled history.
 */
export function isOrderActive(status: OrderStatus): boolean {
  return status === 'pending' || status === 'delivered';
}
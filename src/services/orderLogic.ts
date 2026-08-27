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

/**
 * Whether "Mark Delivered"/"Mark Picked Up" should be offered. The only
 * active status that hasn't been delivered yet is 'pending' -- once
 * delivered, status has moved past this and the action has nothing left
 * to do. Shared by the Orders list (swipe actions) and Order Detail (quick
 * action button) so both stay in sync by construction, not by convention.
 */
export function canMarkDelivered(status: OrderStatus): boolean {
  return status === 'pending';
}

/** Whether "Mark Paid" should be offered -- unpaid, and still in flight
 * (mirrors the 2026-08-22 fix guarding against showing this on a
 * Cancelled-but-still-Unpaid order). */
export function canMarkPaid(status: OrderStatus, paymentStatus: 'unpaid' | 'paid'): boolean {
  return paymentStatus === 'unpaid' && isOrderActive(status);
}

/**
 * Whether delivery can be REVERTED (Delivered/Completed -> Pending). Only
 * offered once delivery has actually been marked -- reverting from
 * 'pending' has nothing to undo, and a 'cancelled' order is closed to
 * further changes.
 */
export function canRevertDelivered(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'completed';
}

/**
 * Whether payment can be REVERTED (paid -> unpaid). Offered from any
 * non-cancelled status -- pending+paid is a real, reachable state (a
 * baker who collects payment up front, before delivery), so this isn't
 * limited to 'delivered'/'completed' the way canRevertDelivered is.
 * Callers still also check `payment_status === 'paid'` themselves, same
 * pattern as canMarkPaid checking 'unpaid'.
 */
export function canRevertPaid(status: OrderStatus): boolean {
  return status !== 'cancelled';
}

/**
 * The reverse of resolveStatusAfterMarking, for undoing a Mark
 * Delivered/Mark Paid tap made in error. Each dimension (delivered/paid)
 * reverts independently:
 * - Reverting delivery from 'completed' drops to 'pending' but leaves
 *   payment_status untouched (still paid) -- the caller doesn't touch
 *   payment_status for a 'delivered' revert.
 * - Reverting payment from 'completed' drops to 'delivered' (still
 *   delivered, just no longer paid) -- the caller sets payment_status to
 *   'unpaid' alongside this for a 'paid' revert.
 * - From 'pending' or 'delivered' (not yet 'completed'), reverting
 *   payment doesn't change `status` at all -- only payment_status moves.
 * Never called for 'cancelled' -- callers guard with canRevertDelivered/
 * canRevertPaid first, same pattern as resolveStatusAfterMarking's own
 * callers.
 */
export function resolveStatusAfterReverting(input: {
  action: 'delivered' | 'paid';
  currentStatus: OrderStatus;
}): OrderStatus {
  if (input.action === 'delivered') {
    return 'pending';
  }
  // action === 'paid'
  return input.currentStatus === 'completed' ? 'delivered' : input.currentStatus;
}
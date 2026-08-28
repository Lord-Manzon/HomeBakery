import { supabase } from './supabase';
import {
  calculateOrderTotals,
  canCancelOrder,
  canRevertDelivered,
  canRevertPaid,
  resolveStatusAfterMarking,
  resolveStatusAfterReverting,
} from './orderLogic';
import { todayDateString } from '../utils/dateFormat';
import type { Order, OrderItem, OrderItemWithNames, OrderRefineFilters, OrderTab, OrderWithItems } from '../types/order';
import type { OrderFormInput } from '../utils/validation/orderSchemas';

async function getCurrentBakerId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error('No authenticated user.');
  return id;
}

type OrderItemRow = OrderItem & {
  products: { name: string } | null;
  product_variants: { name: string } | null;
};

// order_items itself only stores IDs + the frozen price, never a name --
// see docs/types/order.ts's OrderItemWithNames comment. products/
// product_variants use `on delete restrict` (see
// supabase/migrations/0002_phase3_core_tables.sql), so these should
// never actually come back null; the fallback is defensive, not expected.
function mapOrderItem(row: OrderItemRow): OrderItemWithNames {
  const { products, product_variants, ...item } = row;
  return {
    ...item,
    product_name: products?.name ?? 'Deleted product',
    variant_name: product_variants?.name ?? 'Deleted variant',
  };
}

const ORDER_WITH_ITEMS_SELECT = '*, order_items(*, products(name), product_variants(name))';

function mapOrderWithItems(row: Order & { order_items: OrderItemRow[] }): OrderWithItems {
  const { order_items, ...order } = row;
  return {
    ...order,
    items: (order_items ?? []).map(mapOrderItem),
  };
}

/**
 * Per docs/DECISIONS.md's 2026-08-28 entry: `tab` is the base scope
 * (exactly what today/upcoming/all/history already did); `refine` is an
 * optional set of additional AND conditions layered on top. Supabase/
 * PostgREST naturally ANDs repeated .eq()/.in()/.lt() calls on a query
 * builder, so no special-casing is needed for how a refine condition
 * combines with the tab's own restriction -- e.g. Today's built-in
 * status in [pending, delivered] plus refine.status='delivered' narrows
 * correctly to just delivered orders scheduled today. Combinations that
 * are structurally always-empty (e.g. Today + Cancelled) aren't
 * special-cased here -- the UI prevents selecting them (see
 * isStatusFilterAvailable in the Orders screen) rather than the service
 * layer needing to know which combinations don't make sense.
 */
export async function getOrders(
  tab: OrderTab = 'today',
  refine: OrderRefineFilters = {}
): Promise<OrderWithItems[]> {
  const today = todayDateString();
  let query = supabase.from('orders').select(ORDER_WITH_ITEMS_SELECT);

  switch (tab) {
    case 'today':
      query = query.eq('scheduled_date', today).in('status', ['pending', 'delivered']);
      break;
    case 'upcoming':
      query = query.gt('scheduled_date', today).in('status', ['pending', 'delivered']);
      break;
    case 'history':
      // "No longer active" -- everything that's finished one way or
      // another (completed OR cancelled).
      query = query.in('status', ['completed', 'cancelled']);
      break;
    case 'all':
      break;
  }

  if (refine.payment) {
    query = query.eq('payment_status', refine.payment);
  }

  if (refine.fulfillment) {
    query = query.eq('fulfillment_type', refine.fulfillment);
  }

  if (refine.status === 'delivered') {
    // Matches canRevertDelivered's notion in orderLogic.ts (delivered OR
    // completed both mean delivery already happened).
    query = query.in('status', ['delivered', 'completed']);
  } else if (refine.status === 'cancelled') {
    query = query.eq('status', 'cancelled');
  } else if (refine.status === 'overdue') {
    // Same predicate as the per-card Overdue badge in
    // app/(tabs)/orders/index.tsx: still active, and its date has
    // passed.
    query = query.lt('scheduled_date', today).in('status', ['pending', 'delivered']);
  }

  const { data, error } = await query
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true, nullsFirst: false });
  if (error) throw error;

  return (data as unknown as (Order & { order_items: OrderItemRow[] })[]).map(mapOrderWithItems);
}

export async function getOrder(id: string): Promise<OrderWithItems> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return mapOrderWithItems(data as unknown as Order & { order_items: OrderItemRow[] });
}

async function fetchVariantPrices(variantIds: string[]): Promise<Map<string, number>> {
  const uniqueIds = Array.from(new Set(variantIds));
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, selling_price')
    .in('id', uniqueIds);
  if (error) throw error;

  const map = new Map<string, number>();
  for (const row of data as { id: string; selling_price: number }[]) {
    map.set(row.id, row.selling_price);
  }
  return map;
}

type ItemWithPrice = {
  id?: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

async function resolveItemsWithPrice(items: OrderFormInput['items']): Promise<ItemWithPrice[]> {
  const priceByVariant = await fetchVariantPrices(items.map((i) => i.variant_id));
  return items.map((item) => {
    const unitPrice = priceByVariant.get(item.variant_id);
    if (unitPrice == null) {
      throw new Error('One of the selected items is no longer available.');
    }
    return { ...item, unit_price: unitPrice, line_total: unitPrice * item.quantity };
  });
}

/**
 * Creates an order and its line items. `unit_price` is deliberately
 * re-fetched here from each variant's CURRENT selling_price rather than
 * trusted from whatever the New Order screen had cached when the baker
 * picked it -- guards against a stale price, and still satisfies
 * docs/DATABASE.md's "copied from variant at order time" rule using the
 * most authoritative value available at that moment.
 *
 * The Supabase client SDK has no multi-table transaction, so this is two
 * sequential inserts. If the order_items insert fails after the order row
 * already succeeded, the order row is deleted as a best-effort rollback
 * rather than leaving an empty, item-less order behind.
 */
export async function createOrder(input: OrderFormInput): Promise<Order> {
  const bakerId = await getCurrentBakerId();
  const itemsWithPrice = await resolveItemsWithPrice(input.items);
  const { subtotal, total } = calculateOrderTotals(itemsWithPrice, input.delivery_fee);

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      baker_id: bakerId,
      customer_name: input.customer_name,
      customer_contact: input.customer_contact,
      order_source: 'manual',
      status: 'pending',
      payment_status: 'unpaid',
      payment_method: null,
      fulfillment_type: input.fulfillment_type,
      delivery_address: input.delivery_address,
      delivery_fee: input.delivery_fee,
      scheduled_date: input.scheduled_date,
      scheduled_time: input.scheduled_time,
      notes: input.notes,
      subtotal,
      total,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  const { error: itemsError } = await supabase.from('order_items').insert(
    itemsWithPrice.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
    }))
  );
  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id);
    throw itemsError;
  }

  return order as Order;
}

/**
 * Updates an order's own fields, then diffs its line items against what's
 * already saved rather than always deleting and recreating them.
 *
 * Per docs/DECISIONS.md's 2026-08-22 entry (flagging this) and the
 * Phase 8 entry (fixing it): the old approach deleted every order_item
 * and inserted fresh ones on every save, which generated new ids each
 * time. That's harmless on its own, but once Production
 * (order_items.production_status) and its inventory deduction
 * (inventory_movements.reference_id -> order_items.id) exist, it would
 * silently orphan both the moment a baker edited an order they'd already
 * started baking against.
 *
 * The fix: an incoming item with an `id` (see orderSchemas.ts's
 * orderItemFormSchema) is UPDATED in place -- its row, and therefore its
 * production_status and any inventory_movements pointing at it, survive
 * untouched. An existing item whose id is no longer present in the
 * incoming list is DELETED (the baker removed it). An incoming item with
 * no `id` is a genuinely new line, INSERTED fresh.
 *
 * Deliberately three separate calls rather than one `upsert()` -- an
 * upsert's insert/update column set is derived from whichever keys are
 * present on each row, and mixing "has id" and "has no id" rows in one
 * array risks Postgrest building an inconsistent column list across the
 * batch. Three explicit, unambiguous steps is worth a few extra round
 * trips for an operation this consequential, especially given order
 * sizes here are always a handful of items, not hundreds.
 *
 * KNOWN LIMITATION, flagged rather than silently built around: if a
 * baker edits the quantity/variant of a line item that was already
 * checked off in Production (and, if auto-deduction was on, already
 * deducted), production_status and the deduction amount are NOT
 * recalculated to match the edit -- the row keeps whatever was true
 * before the edit. Reconciling an already-baked line against a
 * post-hoc order edit is a real edge case worth its own product
 * decision, not something to guess at here.
 */
export async function updateOrder(id: string, input: OrderFormInput): Promise<Order> {
  const itemsWithPrice = await resolveItemsWithPrice(input.items);
  const { subtotal, total } = calculateOrderTotals(itemsWithPrice, input.delivery_fee);

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .update({
      customer_name: input.customer_name,
      customer_contact: input.customer_contact,
      fulfillment_type: input.fulfillment_type,
      delivery_address: input.delivery_address,
      delivery_fee: input.delivery_fee,
      scheduled_date: input.scheduled_date,
      scheduled_time: input.scheduled_time,
      notes: input.notes,
      subtotal,
      total,
    })
    .eq('id', id)
    .select()
    .single();
  if (orderError) throw orderError;

  const { data: existingRows, error: existingError } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', id);
  if (existingError) throw existingError;
  const existingIds = new Set((existingRows ?? []).map((row) => row.id as string));

  const incomingIds = new Set(
    itemsWithPrice.map((item) => item.id).filter((v): v is string => !!v)
  );
  const idsToDelete = Array.from(existingIds).filter((existingId) => !incomingIds.has(existingId));
  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase.from('order_items').delete().in('id', idsToDelete);
    if (deleteError) throw deleteError;
  }

  const toUpdate = itemsWithPrice.filter((item) => item.id && existingIds.has(item.id));
  for (const item of toUpdate) {
    const { error: updateError } = await supabase
      .from('order_items')
      .update({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
      })
      .eq('id', item.id as string);
    if (updateError) throw updateError;
  }

  const toInsert = itemsWithPrice.filter((item) => !item.id || !existingIds.has(item.id));
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from('order_items').insert(
      toInsert.map((item) => ({
        order_id: id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
      }))
    );
    if (insertError) throw insertError;
  }

  return order as Order;
}

/**
 * Hard delete -- orders has no is_active column (unlike products), so per
 * docs/UI_UX_1.md section E.2 this is a real delete, reserved for genuine
 * mistakes (e.g. a duplicate entry). "Cancelled" (see cancelOrder below)
 * is the correct path for an order that isn't happening but should still
 * count in history/reports. order_items cascade-deletes automatically via
 * its FK's `on delete cascade`.
 */
export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) throw error;
}

/** "Mark Delivered"/"Mark Picked Up" quick action -- see
 * src/services/orderLogic.ts's resolveStatusAfterMarking for the actual
 * pending/delivered/completed decision. */
export async function markOrderDelivered(
  order: Pick<Order, 'id' | 'status' | 'payment_status'>
): Promise<Order> {
  const newStatus = resolveStatusAfterMarking({
    action: 'delivered',
    currentStatus: order.status,
    willBePaid: order.payment_status === 'paid',
  });
  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw error;
  return data as Order;
}

/** "Mark Paid" quick action. Per docs/DECISIONS.md's 2026-08-22 entry,
 * the payment method is always recorded alongside payment_status (never
 * left unset) -- the calling screen defaults it to "Cash" when the baker
 * doesn't explicitly change the pre-selected chip. */
export async function markOrderPaid(
  order: Pick<Order, 'id' | 'status'>,
  paymentMethod: string
): Promise<Order> {
  const newStatus = resolveStatusAfterMarking({
    action: 'paid',
    currentStatus: order.status,
    willBePaid: true,
  });
  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus, payment_status: 'paid', payment_method: paymentMethod })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw error;
  return data as Order;
}

/** Per docs/UI_UX_1.md section E.2's inline-confirm delete pattern, and
 * only reachable from pending/delivered per orderLogic.ts's
 * canCancelOrder -- guarded here too (not just in the UI), since a
 * service function shouldn't rely solely on the caller having checked
 * first. */
export async function cancelOrder(order: Pick<Order, 'id' | 'status'>): Promise<Order> {
  if (!canCancelOrder(order.status)) {
    throw new Error('This order can no longer be cancelled.');
  }
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw error;
  return data as Order;
}

/** Undoes a "Mark Delivered"/"Mark Picked Up" made in error. Only touches
 * `status` -- payment_status is a separate, independent dimension (see
 * orderLogic.ts's resolveStatusAfterReverting doc comment). Guarded here
 * too, not just by the caller's canRevertDelivered() check in the UI. */
export async function revertOrderDelivered(order: Pick<Order, 'id' | 'status'>): Promise<Order> {
  if (!canRevertDelivered(order.status)) {
    throw new Error('This order is not marked delivered.');
  }
  const newStatus = resolveStatusAfterReverting({ action: 'delivered', currentStatus: order.status });
  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw error;
  return data as Order;
}

/** Undoes a "Mark Paid" made in error -- clears payment_method alongside
 * payment_status, same "never leave payment_method stale" rule
 * markOrderPaid follows in reverse. */
export async function revertOrderPaid(order: Pick<Order, 'id' | 'status'>): Promise<Order> {
  if (!canRevertPaid(order.status)) {
    throw new Error('This order can no longer be changed.');
  }
  const newStatus = resolveStatusAfterReverting({ action: 'paid', currentStatus: order.status });
  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus, payment_status: 'unpaid', payment_method: null })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw error;
  return data as Order;
}
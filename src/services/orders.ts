import { supabase } from './supabase';
import { calculateOrderTotals, canCancelOrder, resolveStatusAfterMarking } from './orderLogic';
import type { Order, OrderItem, OrderItemWithNames, OrderListFilter, OrderWithItems } from '../types/order';
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

function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Per docs/DECISIONS.md's 2026-08-22 entry: Today/Upcoming/Unpaid are
 * scoped to Active orders only (status pending or delivered) -- "All" is
 * the one filter that also surfaces Completed/Cancelled history, so
 * order history stays reachable without adding chips beyond what
 * docs/UI_UX_1.md section E.2 specifies. "Today" uses the device's local
 * date -- bakers.timezone exists in the schema but isn't used for any
 * date bucketing anywhere in the app yet, so this matches current app
 * behavior rather than introducing timezone-awareness just for Orders.
 */
export async function getOrders(filter: OrderListFilter = 'today'): Promise<OrderWithItems[]> {
  const today = todayDateString();
  let query = supabase.from('orders').select(ORDER_WITH_ITEMS_SELECT);

  switch (filter) {
    case 'today':
      query = query.eq('scheduled_date', today).in('status', ['pending', 'delivered']);
      break;
    case 'upcoming':
      query = query.gt('scheduled_date', today).in('status', ['pending', 'delivered']);
      break;
    case 'unpaid':
      query = query.eq('payment_status', 'unpaid').in('status', ['pending', 'delivered']);
      break;
    case 'all':
      break;
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

type ItemWithPrice = { product_id: string; variant_id: string; quantity: number; unit_price: number; line_total: number };

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
 * Updates an order's own fields AND replaces its line items entirely
 * (delete existing order_items for this order, insert fresh ones from
 * `input`) -- the FULL-payload pattern this codebase always uses for
 * updates, per the "watch for partial-payload saves" note carried over
 * from Products.
 *
 * KNOWN TRADEOFF, flagged rather than silently built around: replacing
 * items generates new order_item ids on every edit. That throws away any
 * order_items.production_status the baker had already set, and once
 * Phase 8 (Production / inventory deduction) exists, it would also orphan
 * an inventory_movements.reference_id pointing at a now-deleted item id.
 * Not a live problem today -- Production doesn't exist yet and nothing in
 * the app sets production_status to 'done' -- but a proper diff-based
 * update (match existing items by id, only insert/delete what actually
 * changed) is worth doing before or during Phase 8, not carried past that
 * point without revisiting.
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

  const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', id);
  if (deleteError) throw deleteError;

  const { error: itemsError } = await supabase.from('order_items').insert(
    itemsWithPrice.map((item) => ({
      order_id: id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
    }))
  );
  if (itemsError) throw itemsError;

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
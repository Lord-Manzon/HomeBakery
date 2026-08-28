/**
 * Per docs/DECISIONS.md's 2026-08-22 entry: the lifecycle was simplified
 * from the original 6-value spec (pending/confirmed/preparing/ready/
 * completed/cancelled) down to 4. 'confirmed'/'preparing' were dropped --
 * Phase 8's Production screen owns per-item baking progress separately
 * via order_items.production_status, so the order itself doesn't need to
 * shadow that granularity. 'completed' is never set directly by a baker
 * action -- it's a derived side effect of both delivered and paid being
 * true (see src/services/orderLogic.ts's resolveStatusAfterMarking).
 */
export type OrderStatus = 'pending' | 'delivered' | 'completed' | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid';
export type FulfillmentType = 'pickup' | 'delivery';
export type OrderSource = 'manual' | 'storefront';
export type ProductionStatus = 'pending' | 'done';

export type Order = {
  id: string;
  baker_id: string;
  customer_name: string;
  customer_contact: string | null;
  order_source: OrderSource;
  status: OrderStatus;
  payment_status: PaymentStatus;
  /** Free text since docs/DECISIONS.md's 2026-08-22 entry -- no longer
   * capped at gcash/cash/bank_transfer. Null until the order is paid. */
  payment_method: string | null;
  fulfillment_type: FulfillmentType;
  delivery_address: string | null;
  delivery_fee: number;
  /** Postgres `date`, serialized as "YYYY-MM-DD". */
  scheduled_date: string;
  /** Postgres `time`, serialized as "HH:MM:SS", or null if not set. */
  scheduled_time: string | null;
  notes: string | null;
  subtotal: number;
  total: number;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  /** Copied from the variant's selling_price at order time, per
   * docs/DATABASE.md -- price history stays correct even if the variant's
   * price later changes. */
  unit_price: number;
  line_total: number;
  production_status: ProductionStatus;
  notes: string | null;
};

/**
 * An order item enriched with the product/variant names it was created
 * from. order_items itself only stores IDs plus the frozen price -- the
 * *names* aren't copied, so displaying a line item always needs a join.
 * A later product/variant rename doesn't rewrite order history; it just
 * means the displayed name reflects whatever that product is called now.
 */
export type OrderItemWithNames = OrderItem & {
  product_name: string;
  variant_name: string;
};

export type OrderWithItems = Order & {
  items: OrderItemWithNames[];
};

/**
 * Per docs/DECISIONS.md's 2026-08-22 entry: "Today"/"Upcoming"/"Unpaid"
 * are scoped to Active orders (pending/delivered) only -- "All" is the
 * one filter that also surfaces Completed and Cancelled history, so
 * order history stays reachable without adding new chips beyond what
 * docs/UI_UX_1.md section E.2 already specifies.
 */
/**
 * 'today'/'upcoming'/'all' are the three primary, always-visible scope
 * filters. The rest (unpaid/paid/pickup/delivered/overdue/cancelled) are
 * secondary "refine" filters tucked into a compact dropdown per
 * docs/DECISIONS.md's 2026-08-27 Orders list redesign -- mutually
 * exclusive with the primary three and with each other, same one-filter-
 * active-at-a-time model as before, just split across two levels of
 * visual prominence based on how often each is actually needed.
 */
export type OrderListFilter =
  | 'today'
  | 'upcoming'
  | 'all'
  | 'unpaid'
  | 'paid'
  | 'pickup'
  | 'delivered'
  | 'overdue'
  | 'cancelled'
  | 'history';
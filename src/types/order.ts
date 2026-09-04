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
 * Per docs/DECISIONS.md's 2026-08-28 entry: replaces the old flat
 * OrderListFilter enum. A tab (base scope -- exactly one active at a
 * time) plus an optional set of refine filters (each an independent
 * extra condition layered on top of the tab) replaces the old model
 * where History competed with Unpaid/Paid/etc. for the same single slot.
 * 'today'/'upcoming'/'all' keep their existing meaning; 'history' is now
 * its own tab instead of a refine option.
 */
export type OrderTab = 'today' | 'upcoming' | 'history';

export type PaymentRefineFilter = 'unpaid' | 'paid';
export type FulfillmentRefineFilter = 'pickup' | 'delivery';
export type StatusRefineFilter = 'delivered' | 'cancelled';

/** Each field is independently optional. Payment/Fulfillment/Status
 * combine with AND when more than one is set, but within a single group
 * only one value can be active (can't be both Unpaid and Paid). */
export type OrderRefineFilters = {
  payment?: PaymentRefineFilter;
  fulfillment?: FulfillmentRefineFilter;
  status?: StatusRefineFilter;
  /** Only ever surfaced in the UI on the History tab -- Today/Upcoming/
   * All are already time-scoped by definition, so a second date bound
   * there would be redundant. Both bounds are inclusive, YYYY-MM-DD to
   * match `scheduled_date`. */
  dateRange?: { start: string; end: string };
};
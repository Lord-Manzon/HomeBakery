import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useHideNavOnScroll } from '../../../src/hooks/useHideNavOnScroll';
import { useQueryClient } from '@tanstack/react-query';
import { getOrders } from '../../../src/services/orders';
import {
  useOrders,
  useMarkOrderDelivered,
  useMarkOrderPaid,
  useRevertOrderDelivered,
  useRevertOrderPaid,
  useCancelOrder,
  useDeleteOrder,
} from '../../../src/hooks/useOrders';
import { useBakerProfile } from '../../../src/hooks/useBakerProfile';
import { usePressScale } from '../../../src/hooks/usePressScale';
import { useThemeColors } from '../../../src/theme/ThemeContext';
import {
  isOrderActive,
  canMarkDelivered,
  canMarkPaid,
  canRevertDelivered,
  canRevertPaid,
  canCancelOrder,
} from '../../../src/services/orderLogic';
import { formatOrderTime, formatGroupHeaderDate, todayDateString } from '../../../src/utils/dateFormat';
import { formatCurrency } from '../../../src/utils/currency';
import { Screen } from '../../../src/components/Screen';
import { ErrorBanner } from '../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { OrderActionSheet } from '../../../src/components/OrderActionSheet';
import { ConfirmDialog } from '../../../src/components/ConfirmDialog';
import { radii, spacing, typography, motionDuration, motionEasing, motionStagger } from '../../../src/theme';
import type { ColorToken } from '../../../src/theme/colors';
import type {
  OrderTab,
  OrderRefineFilters,
  PaymentRefineFilter,
  FulfillmentRefineFilter,
  StatusRefineFilter,
  OrderWithItems,
} from '../../../src/types/order';

type ListRow =
  | { type: 'header'; key: string; date: string; count: number }
  | { type: 'order'; key: string; order: OrderWithItems; index: number };

const TABS: { value: OrderTab; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
  { value: 'history', label: 'History' },
];

// Per docs/DECISIONS.md's 2026-08-28 entry: three independent groups
// instead of one long flat list. Each group is single-select-or-clear;
// more than one group can be active at once and combines with AND on
// top of whichever tab is currently open.
const PAYMENT_FILTERS: { value: PaymentRefineFilter; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
];

const FULFILLMENT_FILTERS: { value: FulfillmentRefineFilter; label: string }[] = [
  { value: 'pickup', label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
];

const STATUS_FILTERS: { value: StatusRefineFilter; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Per docs/DECISIONS.md's 2026-08-28 entry: Overdue and Cancelled are
// structurally incompatible with certain tabs -- Today/Upcoming force an
// active-only, date-restricted scope that can never contain an overdue
// or cancelled order; History's scope excludes active orders entirely,
// which Overdue specifically requires. Disabled rather than tappable-
// but-silently-empty ("Option A").
function isStatusFilterAvailable(tab: OrderTab, value: StatusRefineFilter): boolean {
  if (value === 'overdue') return tab === 'all';
  if (value === 'cancelled') return tab === 'all';
  return true; // 'delivered' is valid on every tab
}

// Per docs/UI_UX_1.md section E.2's *Empty* state, tailored per tab --
// "no orders scheduled today" reads very differently from "you have zero
// orders ever" (the true first-run case, which only "All" can show).
const EMPTY_MESSAGE: Record<OrderTab, string> = {
  today: 'Nothing scheduled for today.',
  upcoming: 'No upcoming orders.',
  all: 'No orders yet.',
  history: 'No completed or cancelled orders yet.',
};

export default function OrdersListScreen() {
  const router = useRouter();
  const onScroll = useHideNavOnScroll();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<OrderTab>('today');
  const [refine, setRefine] = useState<OrderRefineFilters>({});
  const [search, setSearch] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { data: orders, isLoading, isError, refetch } = useOrders(tab, refine);
  const { data: baker } = useBakerProfile();
  const queryClient = useQueryClient();
  const markPaid = useMarkOrderPaid();
  const markDelivered = useMarkOrderDelivered();
  const revertDelivered = useRevertOrderDelivered();
  const revertPaid = useRevertOrderPaid();
  const cancelOrder = useCancelOrder();
  const deleteOrder = useDeleteOrder();

  // Long-press on a card opens this order's action sheet (Revert
  // Delivered/Paid, Cancel, Delete). Cancel/Delete route through
  // `confirmAction` for a follow-up ConfirmDialog once the sheet closes;
  // Revert Delivered/Paid fire immediately, same as this screen's
  // existing Mark Paid/Mark Delivered buttons already do.
  const [actionSheetOrder, setActionSheetOrder] = useState<OrderWithItems | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    order: OrderWithItems;
    type: 'cancel' | 'delete';
  } | null>(null);

  // Prefetches the other three tabs (base scope, no refine) as soon as
  // this screen opens, so swiping/tapping between them feels instant
  // even the FIRST time a baker visits a given tab this session.
  useEffect(() => {
    for (const t of TABS) {
      if (t.value === tab) continue;
      queryClient.prefetchQuery({
        queryKey: ['orders', 'list', t.value, {}],
        queryFn: () => getOrders(t.value),
        staleTime: 60 * 1000,
      });
    }
    // Intentionally NOT re-running on every `tab` change -- see original
    // comment on this effect from Step 17.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the active Status refine becomes unavailable for the tab just
  // switched to (e.g. "Cancelled" was selected on All, then the baker
  // swiped to Today), clear it rather than leaving a selected-but-inert
  // filter silently active.
  useEffect(() => {
    if (refine.status && !isStatusFilterAvailable(tab, refine.status)) {
      setRefine((prev) => ({ ...prev, status: undefined }));
    }
  }, [tab, refine.status]);

  const filtered = (orders ?? []).filter((o) =>
    o.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  // Per docs/DECISIONS.md's 2026-08-27 Orders list redesign: groups
  // orders by scheduled_date into a single flat array of header/order
  // rows, fed straight into one Animated.FlatList -- keeps the existing
  // swipe-action and staggered-entrance code paths intact rather than
  // switching to SectionList. `filtered` is already sorted by
  // scheduled_date ascending (src/services/orders.ts's getOrders), so a
  // Map preserves that same chronological group order on iteration.
  const rows = useMemo(() => {
    const groups = new Map<string, OrderWithItems[]>();
    for (const order of filtered) {
      const list = groups.get(order.scheduled_date) ?? [];
      list.push(order);
      groups.set(order.scheduled_date, list);
    }
    const result: ListRow[] = [];
    let orderIndex = 0;
    for (const [date, group] of groups) {
      result.push({ type: 'header', key: `header-${date}`, date, count: group.length });
      for (const order of group) {
        result.push({ type: 'order', key: order.id, order, index: orderIndex });
        orderIndex += 1;
      }
    }
    return result;
  }, [filtered]);

  const isRefineActive = Boolean(refine.payment || refine.fulfillment || refine.status);

  // Tab and refine are now independent state, so the swipe gesture no
  // longer needs to be conditionally disabled -- `tab` is always exactly
  // one of TABS, unlike the old model where a refine filter could occupy
  // the same slot.
  const currentTabIndex = TABS.findIndex((t) => t.value === tab);
  const tabSwipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX < -50 && currentTabIndex < TABS.length - 1) {
        runOnJS(setTab)(TABS[currentTabIndex + 1].value);
      } else if (e.translationX > 50 && currentTabIndex > 0) {
        runOnJS(setTab)(TABS[currentTabIndex - 1].value);
      }
    });

  if (isLoading) {
    return (
      <Screen style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Orders</Text>
        </View>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={styles.skeletonCard} />
        ))}
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Orders</Text>
        </View>
        <ErrorBanner message="Couldn't load your orders." />
        <PrimaryButton title="Try again" onPress={() => refetch()} />
      </Screen>
    );
  }

  // True first-run emptiness (zero orders ever, not just zero in this
  // filter) only really applies to "All" -- every other filter can
  // legitimately be empty while orders still exist elsewhere.
  const isTrulyEmpty = tab === 'all' && !isRefineActive && orders && orders.length === 0;

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        {isSearchOpen ? (
          <>
            <Pressable
              onPress={() => {
                setIsSearchOpen(false);
                setSearch('');
              }}
              style={styles.iconButton}
              accessibilityLabel="Close search"
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <TextInput
              style={styles.searchInputInline}
              placeholder="Search by customer"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoFocus
            />
            <Pressable
              onPress={() => setIsFilterOpen((v) => !v)}
              style={styles.iconButton}
              accessibilityLabel="More filters"
            >
              <Ionicons
                name="options-outline"
                size={20}
                color={isRefineActive ? colors.primary : colors.textPrimary}
              />
              {isRefineActive ? <View style={styles.filterActiveDot} /> : null}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Orders</Text>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setIsSearchOpen(true)}
                style={styles.iconButton}
                accessibilityLabel="Search orders"
              >
                <Ionicons name="search" size={20} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => setIsFilterOpen((v) => !v)}
                style={styles.iconButton}
                accessibilityLabel="More filters"
              >
                <Ionicons
                  name="options-outline"
                  size={20}
                  color={isRefineActive ? colors.primary : colors.textPrimary}
                />
                {isRefineActive ? <View style={styles.filterActiveDot} /> : null}
              </Pressable>
            </View>
          </>
        )}
      </View>

      {isTrulyEmpty ? (
        <Animated.View
          entering={FadeIn.duration(motionDuration.medium).easing(motionEasing.decelerate)}
          style={styles.emptyContainer}
        >
          <Ionicons name="receipt-outline" size={40} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptyNote}>
            Enter your first order to start replacing the spreadsheet.
          </Text>
          <View style={styles.emptyButton}>
            <PrimaryButton title="New order" onPress={() => router.push('/orders/new')} />
          </View>
        </Animated.View>
      ) : (
        <>
          <View style={styles.tabRow}>
            {TABS.map((t) => {
              const isSelected = tab === t.value;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setTab(t.value)}
                  style={styles.tabItem}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.tabText, isSelected && styles.tabTextSelected]}>{t.label}</Text>
                  <View style={[styles.tabUnderline, isSelected && styles.tabUnderlineSelected]} />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.tabDivider} />

          {isFilterOpen ? (
            <>
              <Pressable style={styles.filterScrim} onPress={() => setIsFilterOpen(false)} />
              <Animated.View
                entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
                style={styles.filterMenu}
              >
                <Text style={styles.filterSectionLabel}>Payment</Text>
                {PAYMENT_FILTERS.map((f) => {
                  const isSelected = refine.payment === f.value;
                  return (
                    <Pressable
                      key={f.value}
                      style={styles.filterMenuRow}
                      onPress={() => {
                        setRefine((prev) => ({
                          ...prev,
                          payment: prev.payment === f.value ? undefined : f.value,
                        }));
                        setIsFilterOpen(false);
                      }}
                    >
                      <Text style={[styles.filterRowText, isSelected && styles.filterRowTextSelected]}>
                        {f.label}
                      </Text>
                      {isSelected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}

                <View style={styles.filterDivider} />

                <Text style={styles.filterSectionLabel}>Fulfillment</Text>
                {FULFILLMENT_FILTERS.map((f) => {
                  const isSelected = refine.fulfillment === f.value;
                  return (
                    <Pressable
                      key={f.value}
                      style={styles.filterMenuRow}
                      onPress={() => {
                        setRefine((prev) => ({
                          ...prev,
                          fulfillment: prev.fulfillment === f.value ? undefined : f.value,
                        }));
                        setIsFilterOpen(false);
                      }}
                    >
                      <Text style={[styles.filterRowText, isSelected && styles.filterRowTextSelected]}>
                        {f.label}
                      </Text>
                      {isSelected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}

                <View style={styles.filterDivider} />

                <Text style={styles.filterSectionLabel}>Status</Text>
                {STATUS_FILTERS.map((f) => {
                  const isSelected = refine.status === f.value;
                  const isAvailable = isStatusFilterAvailable(tab, f.value);
                  return (
                    <Pressable
                      key={f.value}
                      style={styles.filterMenuRow}
                      disabled={!isAvailable}
                      onPress={() => {
                        setRefine((prev) => ({
                          ...prev,
                          status: prev.status === f.value ? undefined : f.value,
                        }));
                        setIsFilterOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.filterRowText,
                          isSelected && styles.filterRowTextSelected,
                          !isAvailable && styles.filterRowTextDisabled,
                        ]}
                      >
                        {f.label}
                      </Text>
                      {isSelected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </Animated.View>
            </>
          ) : null}

          <GestureDetector gesture={tabSwipeGesture}>
          <Animated.FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: spacing.xxxl + 96 }}
            ListEmptyComponent={
              <Text style={styles.emptyFilterText}>
                {search.length > 0
                  ? `No orders match "${search}"`
                  : isRefineActive
                    ? 'No orders match these filters.'
                    : EMPTY_MESSAGE[tab]}
              </Text>
            }
            renderItem={({ item }) => {
              if (item.type === 'header') {
                const count = item.count === 1 ? '1 order' : `${item.count} orders`;
                return (
                  <View style={styles.dayDivider}>
                    <Text style={styles.dayDividerText}>
                      {formatGroupHeaderDate(item.date)} · {count}
                    </Text>
                  </View>
                );
              }
              return (
                <OrderCard
                  order={item.order}
                  index={item.index}
                  currency={baker?.currency}
                  styles={styles}
                  colors={colors}
                  onEdit={() => router.push(`/orders/${item.order.id}/edit`)}
                  onLongPress={() => setActionSheetOrder(item.order)}
                  onMarkPaid={() =>
                    markPaid.mutate({ order: { id: item.order.id, status: item.order.status }, paymentMethod: 'Cash' })
                  }
                  onMarkDelivered={() =>
                    markDelivered.mutate({
                      id: item.order.id,
                      status: item.order.status,
                      payment_status: item.order.payment_status,
                    })
                  }
                />
              );
            }}
          />
          </GestureDetector>
        </>
      )}

      <OrderActionSheet
        visible={!!actionSheetOrder}
        customerName={actionSheetOrder?.customer_name ?? ''}
        canRevertDelivered={actionSheetOrder ? canRevertDelivered(actionSheetOrder.status) : false}
        canRevertPaid={actionSheetOrder ? canRevertPaid(actionSheetOrder.status) : false}
        canCancel={actionSheetOrder ? canCancelOrder(actionSheetOrder.status) : false}
        fulfillmentType={actionSheetOrder?.fulfillment_type ?? 'pickup'}
        onDismiss={() => setActionSheetOrder(null)}
        onRevertDelivered={() => {
          if (actionSheetOrder) {
            revertDelivered.mutate({ id: actionSheetOrder.id, status: actionSheetOrder.status });
          }
          setActionSheetOrder(null);
        }}
        onRevertPaid={() => {
          if (actionSheetOrder) {
            revertPaid.mutate({ id: actionSheetOrder.id, status: actionSheetOrder.status });
          }
          setActionSheetOrder(null);
        }}
        onCancel={() => {
          if (actionSheetOrder) setConfirmAction({ order: actionSheetOrder, type: 'cancel' });
          setActionSheetOrder(null);
        }}
        onDelete={() => {
          if (actionSheetOrder) setConfirmAction({ order: actionSheetOrder, type: 'delete' });
          setActionSheetOrder(null);
        }}
      />

      <ConfirmDialog
        visible={!!confirmAction}
        title={confirmAction?.type === 'delete' ? 'Delete this order?' : 'Cancel this order?'}
        message={
          confirmAction?.type === 'delete'
            ? "This can't be undone. If it just needs to not go ahead, Cancel keeps it in your history instead."
            : 'It stays in your order history as Cancelled.'
        }
        confirmLabel={confirmAction?.type === 'delete' ? 'Confirm delete' : 'Confirm cancel'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'delete') {
            deleteOrder.mutate(confirmAction.order.id);
          } else {
            cancelOrder.mutate({ id: confirmAction.order.id, status: confirmAction.order.status });
          }
          setConfirmAction(null);
        }}
      />
    </Screen>
  );
}

// "2× Carrot Cake (Medium) +1 more" -- matches the "+N more" chip pattern
// already used for Products' variant price chips, so a multi-item order
// reads at a glance without listing every line on the card itself.
function formatItemsSummary(items: OrderWithItems['items']): string {
  if (items.length === 0) return 'No items';
  const first = items[0];
  const firstLabel = `${first.quantity}× ${first.product_name} (${first.variant_name})`;
  return items.length === 1 ? firstLabel : `${firstLabel} +${items.length - 1} more`;
}



function OrderCard({
  order,
  index,
  currency,
  styles,
  colors,
  onEdit,
  onLongPress,
  onMarkPaid,
  onMarkDelivered,
}: {
  order: OrderWithItems;
  index: number;
  currency: string | null | undefined;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onEdit: () => void;
  onLongPress: () => void;
  onMarkPaid: () => void;
  onMarkDelivered: () => void;
}) {
  const press = usePressScale();
  const [isExpanded, setIsExpanded] = useState(false);
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  // Per docs/DECISIONS.md's 2026-08-27 Orders list redesign: one badge
  // slot, not two -- collapses the old separate status badge + payment
  // badge into a single priority-ordered label (Cancelled overrides
  // Overdue overrides Paid/Unpaid), since payment status is the one
  // status dimension the redesign's field list actually calls for.
  const isOverdue = isOrderActive(order.status) && order.scheduled_date < todayDateString();
  const badgeLabel =
    order.status === 'cancelled'
      ? 'Cancelled'
      : isOverdue
        ? 'Overdue'
        : order.payment_status === 'paid'
          ? 'Paid'
          : 'Unpaid';
  const badgeColor =
    order.status === 'cancelled'
      ? colors.statusCancelled
      : isOverdue
        ? colors.danger
        : order.payment_status === 'paid'
          ? colors.success
          : colors.warning;

  const hasTime = Boolean(order.scheduled_time);
  const timeLabel = formatOrderTime(order.scheduled_time) ?? 'No time set';
  const fulfillmentLabel = order.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup';

  const canPay = canMarkPaid(order.status, order.payment_status);
  const canDeliver = canMarkDelivered(order.status);

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
    >
      <Pressable
        onPress={() => setIsExpanded((v) => !v)}
        onLongPress={onLongPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Animated.View style={[styles.card, press.style]}>
          <View style={styles.cardTopRow}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardName} numberOfLines={1}>
                {order.customer_name}
              </Text>
              <View style={styles.statusIndicator}>
                <View style={[styles.statusDot, { backgroundColor: badgeColor }]} />
                <Text style={[styles.statusText, { color: badgeColor }]}>{badgeLabel}</Text>
              </View>
            </View>
            <Text style={styles.cardTotal}>{formatCurrency(order.total, currency)}</Text>
          </View>

          <Text style={styles.cardItems} numberOfLines={1}>
            {formatItemsSummary(order.items)}
          </Text>

          <View style={styles.cardMiddleRow}>
            <Text style={styles.cardMetaText}>
              <Text style={!hasTime ? styles.cardMetaTextMuted : undefined}>{timeLabel}</Text>
              {' · '}
              {fulfillmentLabel}
            </Text>
            <View style={styles.cardActionsRow}>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                style={styles.cardIconButton}
                hitSlop={12}
                accessibilityLabel="Edit order"
              >
                <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setIsExpanded((v) => !v);
                }}
                style={styles.cardIconButton}
                hitSlop={12}
                accessibilityLabel={isExpanded ? 'Collapse order' : 'Expand order'}
              >
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          {/* Mark Paid/Mark Delivered are part of the compact row now,
              not gated behind expand -- these are the most-used actions
              on this screen and shouldn't cost an extra tap. */}
          {canPay || canDeliver ? (
            <View style={styles.actionButtonRow}>
              {canPay ? (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onMarkPaid();
                  }}
                >
                  <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
                  <Text style={styles.actionButtonText}>Mark as Paid</Text>
                </Pressable>
              ) : null}
              {canDeliver ? (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onMarkDelivered();
                  }}
                >
                  <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
                  <Text style={styles.actionButtonText}>
                    {order.fulfillment_type === 'delivery' ? 'Mark Delivered' : 'Mark Picked Up'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {isExpanded ? (
            <Animated.View
              entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
              style={styles.expandedSection}
            >
              <Text style={styles.expandedSectionLabel}>Items</Text>
              {order.items.map((lineItem) => (
                <View key={lineItem.id} style={styles.expandedItemRow}>
                  <Text style={styles.expandedItemText} numberOfLines={1}>
                    {lineItem.quantity}× {lineItem.product_name} · {lineItem.variant_name}
                  </Text>
                  <Text style={styles.expandedItemPrice}>
                    {formatCurrency(lineItem.line_total, currency)}
                  </Text>
                </View>
              ))}

              <View style={styles.expandedDivider} />

              <Text style={styles.expandedSectionLabel}>Order</Text>
              {order.customer_contact ? (
                <View style={styles.expandedDetailRow}>
                  <Text style={styles.expandedDetailLabel}>Contact</Text>
                  <Text style={styles.expandedDetailValue}>{order.customer_contact}</Text>
                </View>
              ) : null}
              <View style={styles.expandedDetailRow}>
                <Text style={styles.expandedDetailLabel}>Schedule</Text>
                <Text style={styles.expandedDetailValue}>{timeLabel}</Text>
              </View>
              <View style={styles.expandedDetailRow}>
                <Text style={styles.expandedDetailLabel}>Method</Text>
                <Text style={styles.expandedDetailValue}>{fulfillmentLabel}</Text>
              </View>
              {order.fulfillment_type === 'delivery' && order.delivery_address ? (
                <View style={styles.expandedDetailRow}>
                  <Text style={styles.expandedDetailLabel}>Address</Text>
                  <Text style={styles.expandedDetailValue}>{order.delivery_address}</Text>
                </View>
              ) : null}

              {order.notes ? (
                <>
                  <View style={styles.expandedDivider} />
                  <Text style={styles.expandedSectionLabel}>Notes</Text>
                  <Text style={styles.expandedItemText}>{order.notes}</Text>
                </>
              ) : null}
            </Animated.View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// Styles are built per-render from the live theme palette rather than a
// static module-level StyleSheet.create() -- see IngredientsListScreen /
// PrimaryButton for the same pattern, needed so the screen reacts to the
// baker's accent color / light-dark mode.
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
    },
    // Per docs/DECISIONS.md's 2026-08-27 entry: search moved from an
    // always-visible full-width bar into a collapsible header icon,
    // mirroring Products' exact search pattern
    // (app/(tabs)/more/products/index.tsx) rather than inventing a
    // second search UI convention in the same app.
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    title: { ...typography.displaySm, color: colors.textPrimary },
    headerActions: { flexDirection: 'row', gap: spacing.sm },
    searchInputInline: {
      flex: 1,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
      paddingHorizontal: spacing.sm,
    },
    skeletonCard: {
      height: 84,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
      marginBottom: spacing.sm,
    },
    tabRow: {
      flexDirection: 'row',
      gap: spacing.lg,
    },
    tabItem: {
      alignItems: 'center',
      paddingBottom: spacing.xs,
    },
    tabText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
    tabTextSelected: { color: colors.primary },
    tabUnderline: {
      marginTop: spacing.xxs,
      width: 20,
      height: 2,
      borderRadius: 1,
      backgroundColor: 'transparent',
    },
    tabUnderlineSelected: { backgroundColor: colors.primary },
    tabDivider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.md },
    // Compact refine-filter dropdown -- deliberately reuses the exact
    // pattern already shipped for Products' sort/display dropdown
    // (app/(tabs)/more/products/index.tsx) rather than inventing a new
    // one, per this redesign's "consistent with the existing app" goal.
    iconButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterActiveDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    filterScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 5,
    },
    filterMenu: {
      position: 'absolute',
      top: 56,
      right: spacing.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      overflow: 'hidden',
      zIndex: 10,
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      minWidth: 170,
    },
    filterSectionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxs,
    },
    filterMenuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 44,
    },
    filterRowText: { ...typography.bodySm, color: colors.textPrimary },
    filterRowTextSelected: { color: colors.primary, fontWeight: '600' },
    filterRowTextDisabled: { color: colors.textSecondary, opacity: 0.4 },
    filterDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
    // Per docs/DECISIONS.md's 2026-08-27 refinement: flanking lines
    // extend from the day label, per the reference request -- makes the
    // day break read clearly without adding another bordered container.
    dayDivider: {
      alignItems: 'center',
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    dayDividerText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
    // Per docs/DECISIONS.md's 2026-08-27 refinement: flatter and tighter
    // than a standard app card -- no border (relies on the
    // surface-vs-background color contrast alone for separation), a
    // smaller radius, and reduced padding, since this list is meant for
    // fast scanning, not to read as a set of individual dashboard
    // widgets. A deliberate, documented exception to the app's usual
    // "List row card" component, same category of exception as
    // Products' own Grid card (2026-08-18 entry).
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.xs,
    },
    cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600', flexShrink: 1 },
    // Per docs/DECISIONS.md's 2026-08-27 entry: dropped the filled pill
    // background in favor of a plain colored dot + text -- one more step
    // toward the "flatter, not another chip" direction this list's been
    // moving in across the earlier refinement passes.
    statusIndicator: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { ...typography.caption, fontWeight: '600' },
    cardMiddleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    cardItems: { ...typography.bodySm, color: colors.textSecondary, flex: 1, marginBottom: spacing.xs },
    // Per docs/DECISIONS.md's 2026-08-27 refinement: dialed back from
    // typography.metric (22/600) to titleLg (16/600) -- still bold and
    // clearly the price, but no longer visually outweighing the
    // customer name and the rest of the row. typography.metric stays
    // defined and available for a context that actually needs that much
    // weight (e.g. a future Reports summary figure).
    cardTotal: { ...typography.titleLg, color: colors.textPrimary },
    // Time + fulfillment merged into one line rather than two stacked
    // right-column elements (badge, then this) -- per the 2026-08-27
    // refinement, the original 3-row layout read as a "busy" right
    // column even though it was only ever pairs of two per row.
    cardMetaText: { ...typography.caption, color: colors.textSecondary },
    // Distinguishes the "No time set" placeholder from a real scheduled
    // time -- otherwise both read with identical weight and the
    // placeholder can pass for actual data at a glance.
    cardMetaTextMuted: { fontStyle: 'italic', opacity: 0.7 },
    cardActionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    cardIconButton: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    expandedSection: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.xxs,
    },
    expandedSectionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
      marginBottom: spacing.xxs,
    },
    expandedItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingVertical: spacing.xxs,
    },
    expandedItemText: { ...typography.bodySm, color: colors.textPrimary, flex: 1 },
    expandedItemPrice: { ...typography.bodySm, color: colors.textPrimary },
    expandedDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
    expandedDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.xxs,
    },
    expandedDetailLabel: { ...typography.bodySm, color: colors.textSecondary },
    expandedDetailValue: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    actionButtonRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      minHeight: 44,
    },
    actionButtonText: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: {
      ...typography.titleLg,
      color: colors.textPrimary,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    emptyNote: {
      ...typography.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    emptyButton: { width: '100%' },
    emptyFilterText: {
      ...typography.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
  });
}

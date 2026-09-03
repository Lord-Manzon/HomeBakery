import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
import {
  formatOrderTime,
  formatOrderDate,
  formatGroupHeaderDate,
  todayDateString,
  toISODateString,
  fromISODateString,
} from '../../../src/utils/dateFormat';
import { formatCurrency } from '../../../src/utils/currency';
import { titleCase } from '../../../src/utils/textFormat';
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

// History-only. 'custom' isn't a computable range itself -- picking it
// just reveals the two date fields below, seeded with the last applied
// range (or today) so there's never an empty/invalid state to submit.
type DatePreset = 'today' | 'week' | 'custom';
const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'custom', label: 'Custom' },
];

function presetToRange(preset: 'today' | 'week'): { start: string; end: string } {
  const now = new Date();
  if (preset === 'today') {
    const s = toISODateString(now);
    return { start: s, end: s };
  }
  // Week = the 7 days ending today, not a calendar-Monday week -- matches
  // "how'd I do this week" better than a Mon-Sun box that's mostly empty
  // on a Tuesday.
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  return { start: toISODateString(start), end: toISODateString(now) };
}

function formatRangeLabel(range: { start: string; end: string }): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  // fromISODateString, not `new Date(range.start)` -- a bare "YYYY-MM-DD"
  // parses as UTC midnight, which rolls to the wrong calendar day on
  // negative-UTC-offset devices. Same reasoning as everywhere else in
  // dateFormat.ts.
  const start = fromISODateString(range.start).toLocaleDateString('en-US', opts);
  if (range.start === range.end) return start;
  const end = fromISODateString(range.end).toLocaleDateString('en-US', opts);
  return `${start} – ${end}`;
}

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
  // Draft state for the date-range picker -- Today/This week apply
  // immediately (no ambiguity to confirm), but Custom needs its own
  // Apply so two half-edited fields never fire a query mid-edit.
  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const [draftRange, setDraftRange] = useState(() => presetToRange('today'));
  // Which of the two Custom fields has its native picker open, if any --
  // mirrors OrderForm.tsx's showDatePicker/showTimePicker pattern rather
  // than a free-text field, so typing a date isn't possible to get wrong.
  const [openDateField, setOpenDateField] = useState<'start' | 'end' | null>(null);
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

  // Date range only ever makes sense on History (every other tab is
  // already time-scoped by its own definition) -- same "clear rather
  // than leave a selected-but-inert filter" rule as Status above.
  useEffect(() => {
    if (refine.dateRange && tab !== 'history') {
      setRefine((prev) => ({ ...prev, dateRange: undefined }));
    }
  }, [tab, refine.dateRange]);

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

  const isRefineActive = Boolean(
    refine.payment || refine.fulfillment || refine.status || refine.dateRange
  );

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

          {tab === 'history' && refine.dateRange ? (
            <Pressable
              style={styles.activeRangePill}
              onPress={() => setRefine((prev) => ({ ...prev, dateRange: undefined }))}
            >
              <Text style={styles.activeRangeText}>{formatRangeLabel(refine.dateRange)}</Text>
              <Ionicons name="close" size={13} color={colors.warning} />
            </Pressable>
          ) : null}

          {isFilterOpen ? (
            <>
              <Pressable style={styles.filterScrim} onPress={() => setIsFilterOpen(false)} />
              <Animated.View
                entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
                style={styles.filterMenu}
              >
                <Text style={styles.filterSectionLabel}>Payment</Text>
                {/* Segmented track, not a list -- Payment is strictly
                    either/or, so one control communicates that structure
                    instead of two separate rows that look independently
                    selectable. */}
                <View style={styles.segmentedTrack}>
                  {PAYMENT_FILTERS.map((f) => {
                    const isSelected = refine.payment === f.value;
                    return (
                      <Pressable
                        key={f.value}
                        style={[styles.segmentedOption, isSelected && styles.segmentedOptionSelected]}
                        onPress={() =>
                          setRefine((prev) => ({
                            ...prev,
                            payment: prev.payment === f.value ? undefined : f.value,
                          }))
                        }
                      >
                        <Text
                          style={[styles.segmentedText, isSelected && styles.segmentedTextSelected]}
                        >
                          {f.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.filterDivider} />

                <Text style={styles.filterSectionLabel}>Fulfillment</Text>
                <View style={styles.segmentedTrack}>
                  {FULFILLMENT_FILTERS.map((f) => {
                    const isSelected = refine.fulfillment === f.value;
                    const icon = f.value === 'delivery' ? 'bicycle-outline' : 'bag-handle-outline';
                    return (
                      <Pressable
                        key={f.value}
                        style={[styles.segmentedOption, isSelected && styles.segmentedOptionSelected]}
                        onPress={() =>
                          setRefine((prev) => ({
                            ...prev,
                            fulfillment: prev.fulfillment === f.value ? undefined : f.value,
                          }))
                        }
                      >
                        <Ionicons
                          name={icon}
                          size={14}
                          color={isSelected ? colors.textInverse : colors.textSecondary}
                        />
                        <Text
                          style={[styles.segmentedText, isSelected && styles.segmentedTextSelected]}
                        >
                          {f.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.filterDivider} />

                <Text style={styles.filterSectionLabel}>Status</Text>
                {/* Rows, not a track -- three mutually exclusive options
                    with a genuinely disabled state (Overdue/Cancelled off
                    Today/Upcoming) doesn't fit a two-cell segmented shape.
                    The dot reuses each status's own badge color from the
                    order row itself, rather than inventing a new filter-
                    only color language. */}
                {STATUS_FILTERS.map((f) => {
                  const isSelected = refine.status === f.value;
                  const isAvailable = isStatusFilterAvailable(tab, f.value);
                  const dotColor =
                    f.value === 'cancelled'
                      ? colors.statusCancelled
                      : f.value === 'overdue'
                        ? colors.danger
                        : colors.success;
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
                      <View style={styles.filterRowLabelGroup}>
                        <View
                          style={[
                            styles.filterRowDot,
                            { backgroundColor: dotColor },
                            !isAvailable && styles.filterRowDotDisabled,
                          ]}
                        />
                        <Text
                          style={[
                            styles.filterRowText,
                            isSelected && styles.filterRowTextSelected,
                            !isAvailable && styles.filterRowTextDisabled,
                          ]}
                        >
                          {f.label}
                        </Text>
                      </View>
                      {isSelected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}

                {tab === 'history' ? (
                  <>
                    <View style={styles.filterDivider} />
                    <Text style={styles.filterSectionLabel}>Date range</Text>
                    <View style={styles.presetRow}>
                      {DATE_PRESETS.map((p) => {
                        const isSelected = activePreset === p.value;
                        return (
                          <Pressable
                            key={p.value}
                            style={styles.presetTab}
                            onPress={() => {
                              setActivePreset(p.value);
                              if (p.value === 'custom') return;
                              const range = presetToRange(p.value);
                              setDraftRange(range);
                              setRefine((prev) => ({ ...prev, dateRange: range }));
                            }}
                          >
                            <Text
                              style={[styles.presetText, isSelected && styles.presetTextSelected]}
                            >
                              {p.label}
                            </Text>
                            {isSelected ? <View style={styles.presetUnderline} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>

                    {activePreset === 'custom' ? (
                      <View style={styles.dateFieldsColumn}>
                        <View style={styles.dateFieldLabeled}>
                          <Text style={styles.dateFieldLabel}>From</Text>
                          <Pressable style={styles.dateField} onPress={() => setOpenDateField('start')}>
                            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                            <Text style={styles.dateFieldText}>{formatOrderDate(draftRange.start)}</Text>
                          </Pressable>
                        </View>
                        <View style={styles.dateFieldLabeled}>
                          <Text style={styles.dateFieldLabel}>To</Text>
                          <Pressable style={styles.dateField} onPress={() => setOpenDateField('end')}>
                            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                            <Text style={styles.dateFieldText}>{formatOrderDate(draftRange.end)}</Text>
                          </Pressable>
                        </View>
                        {openDateField ? (
                          <DateTimePicker
                            value={fromISODateString(draftRange[openDateField])}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'inline' : 'default'}
                            onChange={(event: DateTimePickerEvent, date?: Date) => {
                              const field = openDateField;
                              setOpenDateField(null);
                              if (event.type === 'set' && date && field) {
                                setDraftRange((prev) => ({ ...prev, [field]: toISODateString(date) }));
                              }
                            }}
                          />
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.dateRangeFooter}>
                      <Pressable
                        style={styles.dateRangeResetButton}
                        onPress={() => {
                          setActivePreset('today');
                          setRefine((prev) => ({ ...prev, dateRange: undefined }));
                        }}
                      >
                        <Text style={styles.dateRangeResetText}>Reset</Text>
                      </Pressable>
                      <Pressable
                        style={styles.dateRangeApplyButton}
                        onPress={() => {
                          setRefine((prev) => ({ ...prev, dateRange: draftRange }));
                          setIsFilterOpen(false);
                        }}
                      >
                        <Text style={styles.dateRangeApplyText}>Apply</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
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
                // The Today tab only ever has one group -- today -- so
                // repeating "Today" here just echoes the active tab pill
                // above it. Every other tab spans multiple days, where
                // the date label is the useful part.
                const dividerText = tab === 'today' ? count : `${formatGroupHeaderDate(item.date)} · ${count}`;
                return (
                  <View style={styles.dayDivider}>
                    <Text style={styles.dayDividerText}>{dividerText}</Text>
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
  const timeLabel = formatOrderTime(order.scheduled_time);
  const fulfillmentLabel = order.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup';
  const fulfillmentIcon = order.fulfillment_type === 'delivery' ? 'bicycle-outline' : 'bag-handle-outline';

  const displayName = titleCase(order.customer_name);

  const canPay = canMarkPaid(order.status, order.payment_status);
  const canDeliver = canMarkDelivered(order.status);
  // The sole or first-available action reads as this card's primary
  // move (solid terracotta); whichever action is still offered once
  // that's done falls back to the outline secondary style.
  const payIsPrimary = canPay;

  // What's shown in the compact row (name, badge, price, item summary,
  // time/method) shouldn't be repeated in the expanded section -- only
  // show what's genuinely new there. A single-item order's full
  // breakdown is identical to the compact summary line, so it's skipped
  // unless there's more than one item to actually break down.
  const showItemsBreakdown = order.items.length > 1;
  const showContact = Boolean(order.customer_contact);
  const showAddress = order.fulfillment_type === 'delivery' && Boolean(order.delivery_address);
  const showNotes = Boolean(order.notes);
  const hasExpandedContent = showItemsBreakdown || showContact || showAddress || showNotes;

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
            <View style={styles.cardNameTextGroup}>
              <Text style={styles.cardName} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: `${badgeColor}22` }]}>
                <Text style={[styles.statusText, { color: badgeColor }]}>{badgeLabel}</Text>
              </View>
            </View>
            <View style={styles.cardTopRightGroup}>
              <Text style={styles.cardTotal}>{formatCurrency(order.total, currency)}</Text>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                style={styles.cardIconButton}
                hitSlop={12}
                accessibilityLabel="Edit order"
              >
                <Ionicons name="pencil-outline" size={15} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.cardItemsRow}>
            <Ionicons name="bag-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.cardItems} numberOfLines={1}>
              {formatItemsSummary(order.items)}
            </Text>
          </View>

          <View style={styles.cardMiddleRow}>
            {hasTime ? (
              <View style={styles.cardMetaItem}>
                <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.cardMetaText}>{timeLabel}</Text>
              </View>
            ) : null}
            <View style={styles.cardMetaItem}>
              <Ionicons name={fulfillmentIcon} size={14} color={colors.textSecondary} />
              <Text style={styles.cardMetaText}>{fulfillmentLabel}</Text>
            </View>
          </View>

          {/* Mark Paid/Mark Delivered are part of the compact row now,
              not gated behind expand -- these are the most-used actions
              on this screen and shouldn't cost an extra tap. */}
          {canPay || canDeliver ? (
            <View style={styles.actionButtonRow}>
              {canPay ? (
                <Pressable
                  style={[styles.actionButton, payIsPrimary ? styles.actionButtonPrimary : styles.actionButtonSecondary]}
                  onPress={(e) => {
                    e.stopPropagation();
                    onMarkPaid();
                  }}
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      { color: payIsPrimary ? colors.textInverse : colors.textPrimary },
                    ]}
                  >
                    Mark as Paid
                  </Text>
                </Pressable>
              ) : null}
              {canDeliver ? (
                <Pressable
                  style={[
                    styles.actionButton,
                    !payIsPrimary ? styles.actionButtonPrimary : styles.actionButtonSecondary,
                  ]}
                  onPress={(e) => {
                    e.stopPropagation();
                    onMarkDelivered();
                  }}
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      { color: !payIsPrimary ? colors.textInverse : colors.textPrimary },
                    ]}
                  >
                    {order.fulfillment_type === 'delivery' ? 'Mark Delivered' : 'Mark Picked Up'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {hasExpandedContent ? (
            <View style={styles.showDetailsRow}>
              <Text style={styles.showDetailsText}>{isExpanded ? 'Hide details' : 'Show details'}</Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.textSecondary}
              />
            </View>
          ) : null}

          {isExpanded ? (
            <Animated.View
              entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
              style={styles.expandedSection}
            >
              {hasExpandedContent ? (
                <>
                  {showItemsBreakdown ? (
                    <>
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
                    </>
                  ) : null}

                  {showContact || showAddress ? (
                    <>
                      {showItemsBreakdown ? <View style={styles.expandedDivider} /> : null}
                      {showContact ? (
                        <View style={styles.expandedDetailRow}>
                          <Text style={styles.expandedDetailLabel}>Contact</Text>
                          <Text style={styles.expandedDetailValue}>{order.customer_contact}</Text>
                        </View>
                      ) : null}
                      {showAddress ? (
                        <View style={styles.expandedDetailRow}>
                          <Text style={styles.expandedDetailLabel}>Address</Text>
                          <Text style={styles.expandedDetailValue}>{order.delivery_address}</Text>
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  {showNotes ? (
                    <>
                      {showItemsBreakdown || showContact || showAddress ? (
                        <View style={styles.expandedDivider} />
                      ) : null}
                      <Text style={styles.expandedSectionLabel}>Notes</Text>
                      <Text style={styles.expandedItemText}>{order.notes}</Text>
                    </>
                  ) : null}
                </>
              ) : (
                <Text style={styles.expandedEmptyText}>Nothing more for this order.</Text>
              )}
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
    // Sits below the tab row, History only. Uses warning (amber), not
    // primary -- an active filter is "pay attention, you're not looking
    // at everything," which is a different signal than the terracotta
    // used for primary actions elsewhere on this screen. Tapping it
    // clears the range directly, so a baker who forgets it's on isn't
    // stuck hunting back through the filter sheet to find the reset.
    activeRangePill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      backgroundColor: colors.warningMuted,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginBottom: spacing.md,
    },
    activeRangeText: { ...typography.bodySm, color: colors.warning, fontWeight: '600' },
    // Payment/Fulfillment -- one grouped track per either/or choice,
    // not two independently-tappable rows. Selected cell reuses the
    // exact solid-primary/textInverse pairing already established by
    // this same screen's Mark as Paid button, rather than a new
    // white-elevated-pill idiom the app hasn't used elsewhere.
    segmentedTrack: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      padding: 3,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.xs,
    },
    segmentedOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xxs,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
    },
    segmentedOptionSelected: { backgroundColor: colors.primary },
    segmentedText: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
    segmentedTextSelected: { color: colors.textInverse },
    // Status stays rows, not a track -- three options with a genuine
    // disabled state doesn't fit a two-cell segmented shape. The dot
    // reuses each status's own badge color from the order card itself
    // (statusDot/statusPill above) instead of a filter-only palette.
    filterRowLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    filterRowDot: { width: 6, height: 6, borderRadius: 3 },
    filterRowDotDisabled: { opacity: 0.4 },
    // History-only date range. Presets reuse the exact underline-tab
    // pattern from the Today/Upcoming/All/History row above (tabRow/
    // tabText/tabUnderline) rather than a third chip style for the same
    // "pick one of a few options" interaction.
    presetRow: { flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    presetTab: { alignItems: 'center' },
    presetText: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
    presetTextSelected: { color: colors.primary },
    presetUnderline: {
      marginTop: spacing.xxs,
      width: 20,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.primary,
    },
    // Stacked, not side-by-side -- two fields sharing one row left each
    // too narrow to show a full YYYY-MM-DD once typed, which was
    // scrolling the input to keep the cursor visible and hiding the
    // leading digits. Full width per field removes the squeeze outright.
    dateFieldsColumn: {
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    dateFieldLabeled: { gap: spacing.xxs },
    dateFieldLabel: { ...typography.caption, color: colors.textSecondary },
    dateField: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dateFieldText: { ...typography.bodySm, color: colors.textPrimary, flex: 1, padding: 0 },
    // Same flex-1-outline / flex-2-solid footer convention as this
    // screen's own Mark as Paid / Mark Delivered row (actionButton /
    // actionButtonPrimary / actionButtonSecondary) -- not a new pair.
    dateRangeFooter: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    dateRangeResetButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      minHeight: 40,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dateRangeResetText: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    dateRangeApplyButton: {
      flex: 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      minHeight: 40,
      backgroundColor: colors.primary,
    },
    dateRangeApplyText: { ...typography.bodySm, color: colors.textInverse, fontWeight: '600' },
    dayDivider: {
      alignItems: 'flex-start',
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
    cardNameTextGroup: { flexShrink: 1, gap: spacing.xxs },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600', flexShrink: 1 },
    // Tinted pill (badge color at low alpha) rather than a bare dot +
    // label -- reads as a real status chip instead of decoration.
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xxs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.full,
    },
    statusText: { ...typography.caption, fontWeight: '600' },
    cardTopRightGroup: { alignItems: 'flex-end', gap: spacing.xs },
    cardItemsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      marginBottom: spacing.xs,
    },
    cardMiddleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.xs,
    },
    cardItems: { ...typography.bodySm, color: colors.textSecondary, flex: 1 },
    cardTotal: { ...typography.titleLg, color: colors.textPrimary },
    cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    cardMetaText: { ...typography.caption, color: colors.textSecondary },
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
    expandedEmptyText: { ...typography.bodySm, color: colors.textSecondary },
    actionButtonRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    actionButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      minHeight: 44,
    },
    actionButtonPrimary: { backgroundColor: colors.primary },
    actionButtonSecondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionButtonText: { ...typography.bodySm, fontWeight: '600' },
    showDetailsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xxs,
      marginTop: spacing.sm,
    },
    showDetailsText: { ...typography.caption, color: colors.textSecondary },
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
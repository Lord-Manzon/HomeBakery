import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useHideNavOnScroll } from '../../../src/hooks/useHideNavOnScroll';
import { useOrders, useMarkOrderDelivered, useMarkOrderPaid } from '../../../src/hooks/useOrders';
import { useBakerProfile } from '../../../src/hooks/useBakerProfile';
import { usePressScale } from '../../../src/hooks/usePressScale';
import { useThemeColors } from '../../../src/theme/ThemeContext';
import { isOrderActive, canMarkDelivered, canMarkPaid } from '../../../src/services/orderLogic';
import { formatOrderTime, formatGroupHeaderDate, todayDateString } from '../../../src/utils/dateFormat';
import { formatCurrency } from '../../../src/utils/currency';
import { Screen } from '../../../src/components/Screen';
import { ErrorBanner } from '../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { radii, spacing, typography, motionDuration, motionEasing, motionStagger } from '../../../src/theme';
import type { ColorToken } from '../../../src/theme/colors';
import type { OrderListFilter, OrderWithItems } from '../../../src/types/order';

type ListRow =
  | { type: 'header'; key: string; date: string; count: number }
  | { type: 'order'; key: string; order: OrderWithItems; index: number };

const PRIMARY_FILTERS: { value: OrderListFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
];

// Per docs/DECISIONS.md's 2026-08-27 Orders list redesign: these six live
// in a compact dropdown behind the filter icon rather than as six more
// pills next to the three primary ones.
const REFINE_FILTERS: { value: OrderListFilter; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Per docs/UI_UX_1.md section E.2's *Empty* state, tailored per filter --
// "no orders scheduled today" reads very differently from "you have zero
// orders ever" (the true first-run case, which only "All" can show).
const EMPTY_MESSAGE: Record<OrderListFilter, string> = {
  today: 'Nothing scheduled for today.',
  upcoming: 'No upcoming orders.',
  all: 'No orders yet.',
  unpaid: 'No unpaid orders — nice!',
  paid: 'No paid orders yet.',
  pickup: 'No pickup orders.',
  delivered: 'No delivered orders yet.',
  overdue: 'Nothing overdue — nice!',
  cancelled: 'No cancelled orders.',
};

export default function OrdersListScreen() {
  const router = useRouter();
  const onScroll = useHideNavOnScroll();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [filter, setFilter] = useState<OrderListFilter>('today');
  const [search, setSearch] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { data: orders, isLoading, isError, refetch } = useOrders(filter);
  const { data: baker } = useBakerProfile();
  const markDelivered = useMarkOrderDelivered();
  const markPaid = useMarkOrderPaid();

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

  const isRefineActive = REFINE_FILTERS.some((f) => f.value === filter);

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
  const isTrulyEmpty = filter === 'all' && orders && orders.length === 0;

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
            {PRIMARY_FILTERS.map((f) => {
              const isSelected = filter === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => setFilter(f.value)}
                  style={styles.tabItem}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.tabText, isSelected && styles.tabTextSelected]}>{f.label}</Text>
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
                <Text style={styles.filterSectionLabel}>Filter by</Text>
                {REFINE_FILTERS.map((f) => {
                  const isSelected = filter === f.value;
                  return (
                    <Pressable
                      key={f.value}
                      style={styles.filterMenuRow}
                      onPress={() => {
                        setFilter(f.value);
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
              </Animated.View>
            </>
          ) : null}

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
                  : EMPTY_MESSAGE[filter]}
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
                  onPress={() => router.push(`/orders/${item.order.id}`)}
                />
              );
            }}
          />
        </>
      )}
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

// Per docs/DECISIONS.md's 2026-08-26 entry: swipe left to reveal quick
// actions, right-to-left, in the order "Mark Paid" then "Mark Delivered"
// (Paid revealed first/closest to the card edge, Delivered revealed last,
// closest to the screen edge). Only the actions that actually apply to
// this order's current status are shown -- an order with nothing left to
// mark (e.g. already Completed) has no swipe actions at all, and the
// gesture is disabled entirely rather than revealing an empty row.
const SWIPE_ACTION_WIDTH = 88;
const SWIPE_OPEN_THRESHOLD = 40;

function SwipeableOrderCard({
  order,
  index,
  currency,
  styles,
  colors,
  onPress,
  onMarkPaid,
  onMarkDelivered,
}: {
  order: OrderWithItems;
  index: number;
  currency: string | null | undefined;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onPress: () => void;
  onMarkPaid: () => void;
  onMarkDelivered: () => void;
}) {
  const canPay = canMarkPaid(order.status, order.payment_status);
  const canDeliver = canMarkDelivered(order.status);
  const actionCount = (canPay ? 1 : 0) + (canDeliver ? 1 : 0);
  const revealWidth = SWIPE_ACTION_WIDTH * actionCount;

  const translateX = useSharedValue(0);

  function close() {
    translateX.value = withSpring(0, { damping: 22, stiffness: 220 });
  }

  const panGesture = Gesture.Pan()
    .enabled(actionCount > 0)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = Math.min(0, Math.max(-revealWidth, e.translationX));
    })
    .onEnd(() => {
      const shouldOpen = translateX.value < -SWIPE_OPEN_THRESHOLD;
      translateX.value = withSpring(shouldOpen ? -revealWidth : 0, { damping: 22, stiffness: 220 });
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  function handleCardPress() {
    // Tapping an open (swiped) card closes it instead of navigating --
    // matches the standard swipeable-list convention (iOS Mail/Reminders)
    // this pattern is deliberately modeled on, per the 2026-08-26 entry.
    if (translateX.value !== 0) {
      close();
      return;
    }
    onPress();
  }

  return (
    <View style={styles.swipeContainer}>
      {actionCount > 0 ? (
        <View style={styles.swipeActionsRow}>
          {canPay ? (
            <Pressable
              style={[styles.swipeAction, { backgroundColor: colors.success }]}
              onPress={() => {
                onMarkPaid();
                close();
              }}
            >
              <Ionicons name="cash-outline" size={18} color={colors.textInverse} />
              <Text style={styles.swipeActionText}>Paid</Text>
            </Pressable>
          ) : null}
          {canDeliver ? (
            <Pressable
              style={[styles.swipeAction, { backgroundColor: colors.primary }]}
              onPress={() => {
                onMarkDelivered();
                close();
              }}
            >
              <Ionicons
                name={order.fulfillment_type === 'delivery' ? 'bicycle-outline' : 'bag-handle-outline'}
                size={18}
                color={colors.textInverse}
              />
              <Text style={styles.swipeActionText}>
                {order.fulfillment_type === 'delivery' ? 'Delivered' : 'Picked up'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardAnimatedStyle}>
          <OrderCard
            order={order}
            index={index}
            currency={currency}
            styles={styles}
            colors={colors}
            onPress={handleCardPress}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function OrderCard({
  order,
  index,
  currency,
  styles,
  colors,
  onPress,
}: {
  order: OrderWithItems;
  index: number;
  currency: string | null | undefined;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onPress: () => void;
}) {
  const press = usePressScale();
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  // Per docs/DECISIONS.md's 2026-08-27 Orders list redesign: one badge
  // slot, not two -- collapses the old separate status badge + payment
  // badge into a single priority-ordered label (Cancelled overrides
  // Overdue overrides Paid/Unpaid), since payment status is the one
  // status dimension the redesign's field list actually calls for. A
  // Cancelled or Overdue order needs to stand out more than its payment
  // state does; everything else, payment is the practically useful
  // signal (a Completed order is always paid by definition, so "Paid"
  // reads correctly for it too, without a separate "Completed" label).
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

  // Date is no longer shown per-card -- the day divider header above
  // already carries it. hasTime distinguishes a real scheduled time from
  // the "No time set" placeholder so the two can be styled differently
  // (below) -- otherwise the placeholder reads as convincingly as real
  // data, per docs/DECISIONS.md's 2026-08-27 refinement entry.
  const hasTime = Boolean(order.scheduled_time);
  const timeLabel = formatOrderTime(order.scheduled_time) ?? 'No time set';
  const fulfillmentLabel = order.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup';

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
    >
      <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
        <Animated.View style={[styles.card, press.style]}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {order.customer_name}
            </Text>
            <Text style={styles.cardTotal}>{formatCurrency(order.total, currency)}</Text>
          </View>

          <View style={styles.cardMiddleRow}>
            <Text style={styles.cardItems} numberOfLines={1}>
              {formatItemsSummary(order.items)}
            </Text>
            <View style={styles.statusIndicator}>
              <View style={[styles.statusDot, { backgroundColor: badgeColor }]} />
              <Text style={[styles.statusText, { color: badgeColor }]}>{badgeLabel}</Text>
            </View>
          </View>

          <Text style={styles.cardMetaText}>
            <Text style={!hasTime ? styles.cardMetaTextMuted : undefined}>{timeLabel}</Text>
            {' · '}
            {fulfillmentLabel}
          </Text>
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
      // Only the left corners round on the card itself -- the right
      // corners are handled by swipeContainer's own borderRadius +
      // overflow:'hidden' clipping it at rest. Rounding all 4 corners
      // here caused a visible gap once the card slid left over the swipe
      // actions: the card's own top-right/bottom-right curves exposed a
      // sliver of the page background mid-seam instead of sitting flush
      // against the action buttons.
      borderTopLeftRadius: radii.md,
      borderBottomLeftRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xxs,
    },
    cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600', flex: 1 },
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
      marginBottom: spacing.xxs,
    },
    cardItems: { ...typography.bodySm, color: colors.textSecondary, flex: 1 },
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
    // Swipe-to-reveal wrapper (Mark Paid / Mark Delivered) -- the card's
    // own marginBottom moved here so the actions row behind it lines up
    // exactly with the card's edges instead of poking out underneath.
    swipeContainer: {
      marginBottom: spacing.xs,
      borderRadius: radii.md,
      overflow: 'hidden',
      position: 'relative',
    },
    swipeActionsRow: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    swipeAction: {
      width: SWIPE_ACTION_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xxs,
    },
    swipeActionText: { ...typography.caption, color: colors.textInverse, fontWeight: '600' },
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

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useHideNavOnScroll } from '../../../src/hooks/useHideNavOnScroll';
import { useOrders } from '../../../src/hooks/useOrders';
import { useBakerProfile } from '../../../src/hooks/useBakerProfile';
import { usePressScale } from '../../../src/hooks/usePressScale';
import { useThemeColors } from '../../../src/theme/ThemeContext';
import { isOrderActive } from '../../../src/services/orderLogic';
import { formatOrderDate, formatOrderTime, todayDateString } from '../../../src/utils/dateFormat';
import { formatCurrency } from '../../../src/utils/currency';
import { Screen } from '../../../src/components/Screen';
import { ErrorBanner } from '../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { radii, spacing, typography, motionDuration, motionEasing, motionStagger } from '../../../src/theme';
import type { ColorToken } from '../../../src/theme/colors';
import type { OrderListFilter, OrderStatus, OrderWithItems } from '../../../src/types/order';

const FILTERS: { value: OrderListFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'all', label: 'All' },
];

// Per docs/UI_UX_1.md section E.2's *Empty* state, tailored per filter --
// "no orders scheduled today" reads very differently from "you have zero
// orders ever" (the true first-run case, which only "All" can show).
const EMPTY_MESSAGE: Record<OrderListFilter, string> = {
  today: 'Nothing scheduled for today.',
  upcoming: 'No upcoming orders.',
  unpaid: 'No unpaid orders — nice!',
  all: 'No orders yet.',
};

export default function OrdersListScreen() {
  const router = useRouter();
  const onScroll = useHideNavOnScroll();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [filter, setFilter] = useState<OrderListFilter>('today');
  const [search, setSearch] = useState('');
  const { data: orders, isLoading, isError, refetch } = useOrders(filter);
  const { data: baker } = useBakerProfile();

  const filtered = (orders ?? []).filter((o) =>
    o.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <Screen style={styles.container}>
        <Text style={styles.title}>Orders</Text>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={styles.skeletonCard} />
        ))}
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen style={styles.container}>
        <Text style={styles.title}>Orders</Text>
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
      <Text style={styles.title}>Orders</Text>

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
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by customer"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterRowContent}
          >
            {FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                label={f.label}
                isSelected={filter === f.value}
                styles={styles}
                onPress={() => setFilter(f.value)}
              />
            ))}
          </ScrollView>

          <Animated.FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
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
            renderItem={({ item, index }) => (
              <OrderCard
                order={item}
                index={index}
                currency={baker?.currency}
                styles={styles}
                colors={colors}
                onPress={() => router.push(`/orders/${item.id}`)}
              />
            )}
          />
        </>
      )}
    </Screen>
  );
}

function FilterChip({
  label,
  isSelected,
  styles,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const press = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Animated.View style={[styles.filterChip, isSelected && styles.filterChipSelected, press.style]}>
        <Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function statusColor(status: OrderStatus, colors: Record<ColorToken, string>): string {
  switch (status) {
    case 'pending':
      return colors.statusPending;
    case 'delivered':
      return colors.statusDelivered;
    case 'completed':
      return colors.statusCompleted;
    case 'cancelled':
      return colors.statusCancelled;
  }
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

  // Per docs/UI_UX_1.md section E.2's *Overdue* state: a still-active
  // order whose date has passed gets a distinct (danger) chip instead of
  // its normal status color, so it doesn't blend into today's orders.
  const isOverdue = isOrderActive(order.status) && order.scheduled_date < todayDateString();
  const badgeLabel = isOverdue ? 'Overdue' : STATUS_LABEL[order.status];
  const badgeColor = isOverdue ? colors.danger : statusColor(order.status, colors);

  const time = formatOrderTime(order.scheduled_time);
  const dateLabel = formatOrderDate(order.scheduled_date);
  const whenLabel = time ? `${dateLabel} · ${time}` : dateLabel;

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
            <View style={[styles.badge, { backgroundColor: `${badgeColor}1F` }]}>
              <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
            </View>
          </View>

          <Text style={styles.cardItems} numberOfLines={1}>
            {formatItemsSummary(order.items)}
          </Text>

          <View style={styles.cardBottomRow}>
            <View style={styles.cardMetaGroup}>
              <Ionicons
                name={order.fulfillment_type === 'delivery' ? 'bicycle-outline' : 'bag-handle-outline'}
                size={14}
                color={colors.textSecondary}
              />
              <Text style={styles.cardMetaText}>{whenLabel}</Text>
            </View>
            <View
              style={[
                styles.paymentBadge,
                { backgroundColor: order.payment_status === 'paid' ? colors.successMuted : colors.warningMuted },
              ]}
            >
              <Text
                style={[
                  styles.paymentBadgeText,
                  { color: order.payment_status === 'paid' ? colors.success : colors.warning },
                ]}
              >
                {order.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
              </Text>
            </View>
            <Text style={styles.cardTotal}>{formatCurrency(order.total, currency)}</Text>
          </View>
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
    title: { ...typography.displaySm, color: colors.textPrimary, marginBottom: spacing.lg },
    skeletonCard: {
      height: 84,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
      marginBottom: spacing.sm,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      height: 44,
      marginBottom: spacing.md,
    },
    searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
    filterRow: { height: 40, maxHeight: 40, flexGrow: 0, flexShrink: 0, marginBottom: spacing.md },
    filterRowContent: { flexGrow: 0, alignItems: 'flex-start', paddingRight: spacing.xl },
    filterChip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      minHeight: 32,
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    filterChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { ...typography.bodySm, color: colors.textPrimary },
    filterChipTextSelected: { color: colors.textInverse },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xxs,
    },
    cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600', flex: 1 },
    badge: {
      borderRadius: radii.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    badgeText: { ...typography.caption, fontWeight: '600' },
    cardItems: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.sm },
    cardBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    cardMetaGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, flex: 1 },
    cardMetaText: { ...typography.caption, color: colors.textSecondary },
    paymentBadge: {
      borderRadius: radii.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    paymentBadgeText: { ...typography.caption, fontWeight: '600' },
    cardTotal: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
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

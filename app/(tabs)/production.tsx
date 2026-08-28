import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHideNavOnScroll } from '../../src/hooks/useHideNavOnScroll';
import { useBakerProfile } from '../../src/hooks/useBakerProfile';
import { useIngredients } from '../../src/hooks/useIngredients';
import {
  useProductionAfter,
  useProductionForDate,
  useSetProductionRowStatus,
} from '../../src/hooks/useProduction';
import { usePressScale } from '../../src/hooks/usePressScale';
import { useThemeColors } from '../../src/theme/ThemeContext';
import { isLowStock, type Ingredient } from '../../src/types/ingredient';
import {
  buildIngredientRequirements,
  calculateProductionProgress,
  countLowIngredientsForRow,
  groupProductionItems,
  groupProductionItemsByDate,
  type IngredientRequirement,
  type ProductionIngredientStatus,
  type ProductionRow,
} from '../../src/services/productionLogic';
import { formatGroupHeaderDate, formatOrderDate, todayDateString, tomorrowDateString } from '../../src/utils/dateFormat';
import { ErrorBanner } from '../../src/components/ErrorBanner';
import { Screen } from '../../src/components/Screen';
import { radii, spacing, typography, motionDuration, motionEasing } from '../../src/theme';
import type { ColorToken } from '../../src/theme/colors';

type ProductionTabKey = 'today' | 'tomorrow' | 'upcoming';
type IngredientsViewKey = 'needed' | 'low';

const PRODUCTION_TABS: { label: string; value: ProductionTabKey }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'Upcoming', value: 'upcoming' },
];

const INGREDIENTS_VIEWS: { label: string; value: IngredientsViewKey }[] = [
  { label: 'Needed for production', value: 'needed' },
  { label: 'Low stock', value: 'low' },
];

/** Rounds to 2 decimals and drops trailing zeros -- recipe-portion math
 * (quantity × recipe_portion × count) can produce floating-point noise
 * (e.g. 0.30000000000000004) that ingredient.current_stock's raw display
 * elsewhere never has to deal with. */
function formatQty(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export default function ProductionScreen() {
  const router = useRouter();
  const onScroll = useHideNavOnScroll();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<ProductionTabKey>('today');
  const [ingredientsView, setIngredientsView] = useState<IngredientsViewKey>('needed');
  // Only the row actually being toggled shows a loading state -- a slow
  // network shouldn't visually freeze rows the baker didn't tap.
  const [pendingRowKey, setPendingRowKey] = useState<string | null>(null);

  const { data: baker } = useBakerProfile();
  const autoDeductEnabled = baker?.auto_deduct_inventory ?? true;

  const today = todayDateString();
  const tomorrow = tomorrowDateString();

  const todayQuery = useProductionForDate(today);
  const tomorrowQuery = useProductionForDate(tomorrow);
  const upcomingQuery = useProductionAfter(tomorrow);
  const { data: allIngredients } = useIngredients();
  const toggleRow = useSetProductionRowStatus();

  const singleDateRows = useMemo(() => {
    if (tab === 'upcoming') return [];
    const items = tab === 'today' ? todayQuery.data : tomorrowQuery.data;
    return items ? groupProductionItems(items) : [];
  }, [tab, todayQuery.data, tomorrowQuery.data]);

  const upcomingGroups = useMemo(() => {
    if (tab !== 'upcoming' || !upcomingQuery.data) return [];
    return groupProductionItemsByDate(upcomingQuery.data);
  }, [tab, upcomingQuery.data]);

  // "Needed for production" always reflects whichever rows are currently
  // on screen -- one date's worth for Today/Tomorrow, the whole range
  // summed for Upcoming (per product decision, 2026-08-27).
  const rowsForRequirements = tab === 'upcoming' ? upcomingGroups.flatMap((g) => g.rows) : singleDateRows;
  const requirements = useMemo(
    () => buildIngredientRequirements(rowsForRequirements),
    [rowsForRequirements]
  );
  const statusByIngredientId = useMemo(
    () => new Map(requirements.map((r) => [r.ingredientId, r.status] as const)),
    [requirements]
  );

  const progress = calculateProductionProgress(singleDateRows);
  const lowStockIngredients = (allIngredients ?? []).filter(isLowStock);

  const handleToggleRow = (row: ProductionRow, scheduledDate: string) => {
    setPendingRowKey(row.key);
    toggleRow.mutate(
      {
        orderItemIds: row.orderItemIds,
        newStatus: row.isDone ? 'pending' : 'done',
        scheduledDate,
        autoDeductEnabled,
      },
      { onSettled: () => setPendingRowKey(null) }
    );
  };

  const activeQuery = tab === 'today' ? todayQuery : tab === 'tomorrow' ? tomorrowQuery : upcomingQuery;
  const dateForTab = tab === 'today' ? today : tab === 'tomorrow' ? tomorrow : null;

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Production</Text>
        <Text style={styles.subtitle}>
          {dateForTab ? formatOrderDate(dateForTab) : 'Beyond tomorrow'}
        </Text>
      </View>

      <SegmentedControl options={PRODUCTION_TABS} value={tab} onChange={setTab} colors={colors} />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: spacing.xxxl + 96 }}
      >
        {tab !== 'upcoming' ? (
          activeQuery.isLoading ? (
            <SkeletonList />
          ) : activeQuery.isError ? (
            <ErrorBanner message="Couldn't load the production list." />
          ) : singleDateRows.length === 0 ? (
            <Text style={styles.emptyText}>
              {tab === 'today' ? 'Nothing to bake today.' : 'Nothing scheduled for tomorrow yet.'}
            </Text>
          ) : (
            <>
              <ProgressBar progress={progress} styles={styles} />

              <View style={styles.listSectionHeader}>
                <Text style={styles.listSectionTitle}>TO MAKE</Text>
                <Text style={styles.listSectionCount}>
                  {progress.total - progress.completed} left
                </Text>
              </View>

              {singleDateRows.map((row, index) => (
                <ProductionRowCard
                  key={row.key}
                  row={row}
                  index={index}
                  styles={styles}
                  colors={colors}
                  isPending={pendingRowKey === row.key && toggleRow.isPending}
                  lowCount={countLowIngredientsForRow(row, statusByIngredientId)}
                  onToggle={() => handleToggleRow(row, dateForTab as string)}
                />
              ))}
            </>
          )
        ) : upcomingQuery.isLoading ? (
          <SkeletonList />
        ) : upcomingQuery.isError ? (
          <ErrorBanner message="Couldn't load upcoming production." />
        ) : upcomingGroups.length === 0 ? (
          <Text style={styles.emptyText}>Nothing scheduled beyond tomorrow yet.</Text>
        ) : (
          upcomingGroups.map((group) => {
            const groupProgress = calculateProductionProgress(group.rows);
            return (
              <View key={group.date} style={styles.dateGroup}>
                <View style={styles.dateGroupHeader}>
                  <Text style={styles.dateGroupTitle}>{formatGroupHeaderDate(group.date)}</Text>
                  <Text style={styles.dateGroupCount}>
                    {groupProgress.completed}/{groupProgress.total} done
                  </Text>
                </View>
                {group.rows.map((row, index) => (
                  <ProductionRowCard
                    key={row.key}
                    row={row}
                    index={index}
                    styles={styles}
                    colors={colors}
                    isPending={pendingRowKey === row.key && toggleRow.isPending}
                    lowCount={countLowIngredientsForRow(row, statusByIngredientId)}
                    onToggle={() => handleToggleRow(row, group.date)}
                  />
                ))}
              </View>
            );
          })
        )}

        <View style={styles.ingredientsSection}>
          <View style={styles.ingredientsHeaderRow}>
            <Text style={styles.listSectionTitle}>INGREDIENTS</Text>
            <Pressable onPress={() => router.push('/ingredients')} hitSlop={8}>
              <Text style={styles.viewAllLink}>View all ›</Text>
            </Pressable>
          </View>

          <SegmentedControl
            options={INGREDIENTS_VIEWS}
            value={ingredientsView}
            onChange={setIngredientsView}
            colors={colors}
          />

          {ingredientsView === 'needed' ? (
            requirements.length === 0 ? (
              <Text style={styles.emptyText}>Nothing needed yet.</Text>
            ) : (
              requirements.map((req) => (
                <IngredientRequirementRow
                  key={req.ingredientId}
                  requirement={req}
                  styles={styles}
                  colors={colors}
                  onRestock={() => router.push(`/ingredients/${req.ingredientId}?openRestock=1`)}
                />
              ))
            )
          ) : lowStockIngredients.length === 0 ? (
            <Text style={styles.emptyText}>Nothing running low right now.</Text>
          ) : (
            lowStockIngredients.map((ingredient) => (
              <LowStockRow
                key={ingredient.id}
                ingredient={ingredient}
                styles={styles}
                colors={colors}
                onRestock={() => router.push(`/ingredients/${ingredient.id}?openRestock=1`)}
              />
            ))
          )}
        </View>
      </Animated.ScrollView>
    </Screen>
  );
}

function SkeletonList() {
  return (
    <>
      {[1, 2, 3].map((n) => (
        <SkeletonCard key={n} />
      ))}
    </>
  );
}

function SkeletonCard() {
  const { colors } = useThemeColors();
  return (
    <View
      style={{
        height: 56,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceMuted,
        marginBottom: spacing.sm,
      }}
    />
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  colors,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  colors: Record<ColorToken, string>;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceMuted,
        borderRadius: radii.md,
        padding: 3,
        marginBottom: spacing.lg,
      }}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            style={{
              flex: 1,
              paddingVertical: spacing.sm,
              borderRadius: radii.sm,
              alignItems: 'center',
              backgroundColor: isSelected ? colors.surface : 'transparent',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                ...typography.bodySm,
                fontWeight: isSelected ? '600' : '400',
                color: isSelected ? colors.textPrimary : colors.textSecondary,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProgressBar({
  progress,
  styles,
}: {
  progress: { completed: number; total: number; percent: number };
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <>
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>
          {progress.completed} of {progress.total} completed
        </Text>
        <Text style={styles.progressPercent}>{progress.percent}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
      </View>
    </>
  );
}

function ProductionRowCard({
  row,
  index,
  styles,
  colors,
  isPending,
  lowCount,
  onToggle,
}: {
  row: ProductionRow;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  isPending: boolean;
  lowCount: number;
  onToggle: () => void;
}) {
  const press = usePressScale();
  // Same capped-stagger idea as Ingredients/Orders' list entrances, just
  // a shorter delay step -- a Production list can run longer (a busy
  // day's full bake list) and shouldn't feel slow to finish animating in.
  const delay = Math.min(index, 10) * 25;

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
    >
      <Pressable
        onPress={onToggle}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={isPending}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: row.isDone, disabled: isPending }}
      >
        <Animated.View style={[styles.rowContainer, press.style]}>
          {isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name={row.isDone ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={row.isDone ? colors.primary : colors.textSecondary}
            />
          )}
          <View style={styles.rowTextContainer}>
            <Text style={[styles.rowTitle, row.isDone && styles.rowTitleDone]} numberOfLines={1}>
              {row.productName} ({row.variantName})
            </Text>
            {row.note ? (
              <Text style={styles.rowNote} numberOfLines={1}>
                {row.note}
              </Text>
            ) : null}
            {lowCount > 0 ? (
              <View style={styles.rowWarningRow}>
                <Ionicons name="alert-circle-outline" size={12} color={colors.warning} />
                <Text style={styles.rowWarningText}>
                  {lowCount} ingredient{lowCount === 1 ? '' : 's'} low
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowQty}>×{formatQty(row.totalQuantity)}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function ingredientStatusVisual(status: ProductionIngredientStatus, colors: Record<ColorToken, string>) {
  switch (status) {
    case 'enough':
      return { icon: 'checkmark-circle' as const, color: colors.success, label: 'Enough' };
    case 'low':
      return { icon: 'alert-circle' as const, color: colors.warning, label: 'Low' };
    case 'insufficient':
      return { icon: 'alert-circle' as const, color: colors.danger, label: 'Need restock' };
  }
}

function IngredientRequirementRow({
  requirement,
  styles,
  colors,
  onRestock,
}: {
  requirement: IngredientRequirement;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onRestock: () => void;
}) {
  const visual = ingredientStatusVisual(requirement.status, colors);
  const needsAction = requirement.status !== 'enough';

  return (
    <View style={styles.ingredientRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.ingredientName} numberOfLines={1}>
          {requirement.name}
        </Text>
        <Text style={styles.ingredientMeta}>
          {formatQty(requirement.currentStock)} {requirement.unit} on hand · {formatQty(requirement.amountNeeded)}{' '}
          {requirement.unit} needed
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <View style={styles.statusRow}>
          <Ionicons name={visual.icon} size={14} color={visual.color} />
          <Text style={[styles.statusLabel, { color: visual.color }]}>{visual.label}</Text>
        </View>
        {needsAction ? (
          <Pressable onPress={onRestock} hitSlop={8}>
            <Text style={styles.restockLink}>Restock ›</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function LowStockRow({
  ingredient,
  styles,
  colors,
  onRestock,
}: {
  ingredient: Ingredient;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onRestock: () => void;
}) {
  // Mirrors the Ingredients tab's own "Low stock"/"Out of stock" language
  // (see app/(tabs)/ingredients/index.tsx's lowStockBadge) rather than
  // this screen's "Enough/Low/Need restock" wording above -- this row is
  // showing the SAME general "running low" fact the Ingredients tab
  // already surfaces, not a production-batch-specific shortfall, so it
  // borrows that screen's vocabulary instead of inventing a second one.
  const isOut = ingredient.current_stock <= 0;
  const color = isOut ? colors.danger : colors.warning;
  const label = isOut ? 'Out of stock' : 'Low stock';

  return (
    <View style={styles.ingredientRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.ingredientName} numberOfLines={1}>
          {ingredient.name}
        </Text>
        <Text style={styles.ingredientMeta}>
          {formatQty(ingredient.current_stock)} {ingredient.unit} on hand
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <View style={styles.statusRow}>
          <Ionicons name="alert-circle" size={14} color={color} />
          <Text style={[styles.statusLabel, { color }]}>{label}</Text>
        </View>
        <Pressable onPress={onRestock} hitSlop={8}>
          <Text style={styles.restockLink}>Restock ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Styles are built per-render from the live theme palette, same pattern
// as Ingredients/Orders/PrimaryButton — see FormField.tsx for why.
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xl,
    },
    headerRow: {
      marginBottom: spacing.lg,
    },
    title: { ...typography.displaySm, color: colors.textPrimary },
    subtitle: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xxs },
    emptyText: {
      ...typography.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    progressLabel: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    progressPercent: { ...typography.bodySm, color: colors.textSecondary },
    progressTrack: {
      height: 6,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
      marginBottom: spacing.lg,
    },
    progressFill: {
      height: '100%',
      borderRadius: radii.full,
      backgroundColor: colors.primary,
    },
    listSectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    listSectionTitle: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    listSectionCount: { ...typography.caption, color: colors.textSecondary },
    rowContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowTextContainer: { flex: 1 },
    rowTitle: { ...typography.body, color: colors.textPrimary },
    rowTitleDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
    rowNote: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', marginTop: 1 },
    rowWarningRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    rowWarningText: { ...typography.caption, color: colors.warning },
    rowQty: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    dateGroup: { marginBottom: spacing.lg },
    dateGroupHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    dateGroupTitle: { ...typography.titleSm, color: colors.textPrimary },
    dateGroupCount: { ...typography.caption, color: colors.textSecondary },
    ingredientsSection: { marginTop: spacing.xl },
    ingredientsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    viewAllLink: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    ingredientRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    ingredientName: { ...typography.body, color: colors.textPrimary },
    ingredientMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    statusLabel: { ...typography.caption, fontWeight: '600' },
    restockLink: { ...typography.caption, color: colors.primary, fontWeight: '600', marginTop: 2 },
  });
}

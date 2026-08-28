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

/** Stock can legitimately go negative internally (a batch consumed more
 * than was on hand), but showing "-7.95 kg on hand" to the baker reads
 * like a data bug rather than "you're out". Clamp the displayed number
 * at 0 -- the shortfall is already communicated by the needed amount
 * and the Out of stock grouping. */
function displayStock(value: number): number {
  return Math.max(0, value);
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

  // Grouped once for both the blocking-count banner and the sectioned
  // ingredient list below -- one source of truth for "what's the status
  // of everything this bake needs" instead of recomputing per view.
  const requirementGroups = useMemo(() => groupRequirementsByStatus(requirements), [requirements]);
  const blockingCount = requirementGroups.insufficient.length;

  const progress = calculateProductionProgress(singleDateRows);
  const lowStockIngredients = (allIngredients ?? []).filter(isLowStock);
  const lowStockGroups = useMemo(() => groupIngredientsByStockStatus(lowStockIngredients), [lowStockIngredients]);

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

  // The Ingredients tab already has its own "needs attention" filter
  // (the attentionBanner + showLowStockOnly toggle in
  // app/(tabs)/ingredients/index.tsx) -- reuse that instead of building
  // a second filtered view here. `lowStockOnly=1` mirrors the existing
  // `openAdd=1` param convention that screen already reads.
  const goToLowStock = () => router.push({ pathname: '/ingredients', params: { lowStockOnly: '1' } });

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

              {blockingCount > 0 ? (
                <RestockBanner
                  count={blockingCount}
                  styles={styles}
                  colors={colors}
                  onPress={goToLowStock}
                />
              ) : null}

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
                  onLowPress={goToLowStock}
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
                    onLowPress={goToLowStock}
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

          <UnderlineTabs
            options={INGREDIENTS_VIEWS}
            value={ingredientsView}
            onChange={setIngredientsView}
            styles={styles}
          />

          {ingredientsView === 'needed' ? (
            requirements.length === 0 ? (
              <Text style={styles.emptyText}>Nothing needed yet.</Text>
            ) : (
              <>
                <IngredientStatusSection
                  title="Out of stock"
                  color={colors.danger}
                  items={requirementGroups.insufficient}
                  styles={styles}
                  colors={colors}
                  onRestock={(id) => router.push(`/ingredients/${id}?openRestock=1`)}
                />
                <IngredientStatusSection
                  title="Low stock"
                  color={colors.warning}
                  items={requirementGroups.low}
                  styles={styles}
                  colors={colors}
                  onRestock={(id) => router.push(`/ingredients/${id}?openRestock=1`)}
                />
                <IngredientStatusSection
                  title="Enough on hand"
                  color={colors.success}
                  items={requirementGroups.enough}
                  styles={styles}
                  colors={colors}
                />
              </>
            )
          ) : lowStockIngredients.length === 0 ? (
            <Text style={styles.emptyText}>Nothing running low right now.</Text>
          ) : (
            <>
              <StockStatusSection
                title="Out of stock"
                color={colors.danger}
                items={lowStockGroups.out}
                styles={styles}
                colors={colors}
                onRestock={(id) => router.push(`/ingredients/${id}?openRestock=1`)}
              />
              <StockStatusSection
                title="Low stock"
                color={colors.warning}
                items={lowStockGroups.low}
                styles={styles}
                colors={colors}
                onRestock={(id) => router.push(`/ingredients/${id}?openRestock=1`)}
              />
            </>
          )}
        </View>
      </Animated.ScrollView>
    </Screen>
  );
}

function groupRequirementsByStatus(requirements: IngredientRequirement[]) {
  const insufficient: IngredientRequirement[] = [];
  const low: IngredientRequirement[] = [];
  const enough: IngredientRequirement[] = [];
  for (const r of requirements) {
    if (r.status === 'insufficient') insufficient.push(r);
    else if (r.status === 'low') low.push(r);
    else enough.push(r);
  }
  return { insufficient, low, enough };
}

function groupIngredientsByStockStatus(ingredients: Ingredient[]) {
  const out: Ingredient[] = [];
  const low: Ingredient[] = [];
  for (const i of ingredients) {
    if (i.current_stock <= 0) out.push(i);
    else low.push(i);
  }
  return { out, low };
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

/**
 * Second-level tab style, deliberately different from the top pill
 * SegmentedControl -- this picks between two views of the same
 * "Ingredients" section rather than switching the whole screen's
 * content, so it reads as nested/subordinate rather than a sibling of
 * Today/Tomorrow/Upcoming.
 */
function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
  styles,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.underlineTabs}>
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            style={[styles.underlineTab, isSelected && styles.underlineTabActive]}
          >
            <Text
              numberOfLines={1}
              style={[styles.underlineTabText, isSelected && styles.underlineTabTextActive]}
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

/**
 * Replaces the old per-row red "Need restock" badge that repeated on
 * every ingredient line. One banner, one number, one action -- states
 * the thing that actually matters (can't finish the bake yet) instead
 * of six identical alarms.
 */
function RestockBanner({
  count,
  styles,
  colors,
  onPress,
}: {
  count: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onPress: () => void;
}) {
  return (
    <View style={styles.bannerCard}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} style={{ marginTop: 1 }} />
      <View style={styles.bannerTextWrap}>
        <Text style={styles.bannerTitle}>
          {count} ingredient{count === 1 ? '' : 's'} need{count === 1 ? 's' : ''} restocking
        </Text>
        <Text style={styles.bannerSubtitle}>Today's bake can't finish without them.</Text>
      </View>
      <Pressable onPress={onPress} hitSlop={8}>
        <Text style={styles.bannerAction}>View list</Text>
      </Pressable>
    </View>
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
  onLowPress,
}: {
  row: ProductionRow;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  isPending: boolean;
  lowCount: number;
  onToggle: () => void;
  onLowPress: () => void;
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
              // Nested inside the row's own Pressable (which toggles
              // done/not-done) -- RN gives the innermost Pressable the
              // touch, so tapping the chip opens the filtered ingredient
              // list instead of also toggling the row.
              <Pressable
                onPress={onLowPress}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${lowCount} ingredient${lowCount === 1 ? '' : 's'} running low, view list`}
                style={styles.rowWarningChip}
              >
                <Ionicons name="alert-circle-outline" size={11} color={colors.warning} />
                <Text style={styles.rowWarningText}>
                  {lowCount} ingredient{lowCount === 1 ? '' : 's'} low
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.rowQty}>×{formatQty(row.totalQuantity)}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Shared status-grouped section for the "Needed for production" view.
 * The section header (color + label) carries the status that used to
 * repeat on every row as a badge -- rows underneath just show the
 * number and, if action is possible, a single neutral Restock button.
 */
function IngredientStatusSection({
  title,
  color,
  items,
  styles,
  colors,
  onRestock,
}: {
  title: string;
  color: string;
  items: IngredientRequirement[];
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onRestock?: (ingredientId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.statusGroup}>
      <Text style={[styles.statusGroupTitle, { color }]}>
        {title.toUpperCase()} · {items.length}
      </Text>
      {items.map((req) => (
        <View key={req.ingredientId} style={styles.ingredientRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ingredientName} numberOfLines={1}>
              {req.name}
            </Text>
            <Text style={styles.ingredientMeta}>
              {formatQty(displayStock(req.currentStock))} {req.unit} on hand · {formatQty(req.amountNeeded)}{' '}
              {req.unit} needed
            </Text>
          </View>
          {onRestock ? (
            <Pressable onPress={() => onRestock(req.ingredientId)} style={styles.restockButton} hitSlop={4}>
              <Text style={styles.restockButtonText}>Restock</Text>
            </Pressable>
          ) : (
            <Ionicons name="checkmark" size={18} color={colors.success} />
          )}
        </View>
      ))}
    </View>
  );
}

/** Same shape as IngredientStatusSection but for the Ingredients tab's
 * own Low stock view, which works off Ingredient records rather than
 * IngredientRequirement -- mirrors that screen's own "Low stock"/"Out
 * of stock" vocabulary per the existing convention. */
function StockStatusSection({
  title,
  color,
  items,
  styles,
  colors,
  onRestock,
}: {
  title: string;
  color: string;
  items: Ingredient[];
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onRestock: (ingredientId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.statusGroup}>
      <Text style={[styles.statusGroupTitle, { color }]}>
        {title.toUpperCase()} · {items.length}
      </Text>
      {items.map((ingredient) => (
        <View key={ingredient.id} style={styles.ingredientRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ingredientName} numberOfLines={1}>
              {ingredient.name}
            </Text>
            <Text style={styles.ingredientMeta}>
              {formatQty(displayStock(ingredient.current_stock))} {ingredient.unit} on hand
            </Text>
          </View>
          <Pressable onPress={() => onRestock(ingredient.id)} style={styles.restockButton} hitSlop={4}>
            <Text style={styles.restockButtonText}>Restock</Text>
          </Pressable>
        </View>
      ))}
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
    bannerCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.dangerMuted,
      borderRadius: radii.md,
      padding: spacing.sm,
      marginBottom: spacing.lg,
    },
    bannerTextWrap: { flex: 1 },
    bannerTitle: { ...typography.bodySm, color: colors.danger, fontWeight: '600' },
    bannerSubtitle: { ...typography.caption, color: colors.danger, marginTop: 1 },
    bannerAction: { ...typography.bodySm, color: colors.danger, fontWeight: '600' },
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
    rowWarningChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      alignSelf: 'flex-start',
      backgroundColor: colors.warningMuted,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      marginTop: spacing.xxs,
    },
    rowWarningText: { ...typography.caption, color: colors.warning, fontWeight: '600' },
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
    underlineTabs: {
      flexDirection: 'row',
      gap: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.md,
    },
    underlineTab: {
      paddingBottom: spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    underlineTabActive: { borderBottomColor: colors.primary },
    underlineTabText: { ...typography.bodySm, color: colors.textSecondary },
    underlineTabTextActive: { color: colors.textPrimary, fontWeight: '600' },
    statusGroup: { marginTop: spacing.md },
    statusGroupTitle: {
      ...typography.caption,
      fontWeight: '700',
      letterSpacing: 0.4,
      marginBottom: spacing.xs,
    },
    ingredientRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    ingredientName: { ...typography.body, color: colors.textPrimary },
    ingredientMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
    restockButton: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
    },
    restockButtonText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  });
}
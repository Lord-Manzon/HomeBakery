import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHideNavOnScroll } from '../../src/hooks/useHideNavOnScroll';
import { useBakerProfile } from '../../src/hooks/useBakerProfile';
import {
  useProductionAfter,
  useProductionForDate,
  useSetProductionRowStatus,
} from '../../src/hooks/useProduction';
import { usePressScale } from '../../src/hooks/usePressScale';
import { useThemeColors } from '../../src/theme/ThemeContext';
import {
  buildIngredientRequirements,
  calculateProductionProgress,
  computeIngredientAmount,
  countLowIngredientsForRow,
  getInsufficientIngredientsForRow,
  groupProductionItems,
  groupProductionItemsByDate,
  type IngredientRequirement,
  type InsufficientIngredientLine,
  type ProductionIngredientStatus,
  type ProductionRow,
  type ProductionSourceItem,
} from '../../src/services/productionLogic';
import { formatGroupHeaderDate, todayDateString, tomorrowDateString } from '../../src/utils/dateFormat';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';
import { ErrorBanner } from '../../src/components/ErrorBanner';
import { Screen } from '../../src/components/Screen';
import { radii, spacing, typography, motionDuration, motionEasing } from '../../src/theme';
import type { ColorToken } from '../../src/theme/colors';

type ProductionTabKey = 'today' | 'tomorrow' | 'upcoming';

const PRODUCTION_TABS: { label: string; value: ProductionTabKey }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'Upcoming', value: 'upcoming' },
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

/** Comma-joins a list of names, capping it at 3 with "+N more" -- same
 * truncation idea as OrderCard's item summary, used here for both a
 * row's "For: Carrot Cake, Croissant" attribution and its post-completion
 * "Flour, Sugar deducted" feedback. */
function formatNameList(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}

/**
 * Plain-text body for the "complete anyway?" confirm -- ConfirmDialog
 * only takes a string message, not JSX, so this is built as lines rather
 * than its own component. Per baker feedback (2026-08-28): show the
 * actual CONSEQUENCE (the resulting negative number), not just the raw
 * have/need pair the baker would otherwise have to subtract themselves.
 */
function buildInsufficientMessage(lines: InsufficientIngredientLine[]): string {
  const count = lines.length;
  const detail = lines
    .map((l) => {
      const resulting = formatQty(l.currentStock - l.amountNeeded);
      return `${l.name}: ${formatQty(l.currentStock)} ${l.unit} on hand, needs ${formatQty(l.amountNeeded)} ${l.unit} → ${resulting} ${l.unit}`;
    })
    .join('\n');
  return `${count} ingredient${count === 1 ? '' : 's'} won't fully cover this batch:\n\n${detail}\n\nYou can still complete it — these will just show negative until you restock.`;
}

/** For an ingredient that can't cover this batch, "10 kg needed" makes
 * the baker do the subtraction themselves to find out how short they
 * actually are. Show the shortage directly instead: "Need 2 kg more".
 * Only applies to the insufficient/Out-of-stock case -- Low/Enough
 * already have enough for this batch, so there's no shortage to state. */
function buildIngredientMetaText(req: IngredientRequirement): string {
  const onHand = `${formatQty(displayStock(req.currentStock))} ${req.unit} on hand`;
  if (req.status === 'insufficient') {
    const shortage = req.amountNeeded - req.currentStock;
    return `${onHand} · Need ${formatQty(shortage)} ${req.unit} more`;
  }
  return `${onHand} · ${formatQty(req.amountNeeded)} ${req.unit} needed`;
}

export default function ProductionScreen() {
  const router = useRouter();
  const onScroll = useHideNavOnScroll();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Same guard as FloatingTabBar.tsx's navigateOnce -- without it, a
  // fast double-tap on "View all", a Restock button, or the low-stock
  // banner/chip fires router.push twice before the first navigation has
  // settled, pushing a duplicate screen onto the stack.
  const lastNavAtRef = useRef(0);
  function navigateOnce(action: () => void) {
    const now = Date.now();
    if (now - lastNavAtRef.current < 500) return;
    lastNavAtRef.current = now;
    action();
  }

  const [tab, setTab] = useState<ProductionTabKey>('today');
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

  // Which raw order_items back the row currently being toggled -- whatever
  // query populated the active tab already has this, no extra fetch.
  const rawItemsForTab: ProductionSourceItem[] =
    tab === 'today' ? todayQuery.data ?? [] : tab === 'tomorrow' ? tomorrowQuery.data ?? [] : upcomingQuery.data ?? [];

  // Set only while a row's own ingredients are short on stock and we're
  // waiting on the baker to confirm completing it anyway (see
  // ConfirmDialog below) -- per product decision, 2026-08-28: never block
  // completion, but don't deduct into a confirmed shortfall silently
  // either.
  const [confirmRow, setConfirmRow] = useState<{
    row: ProductionRow;
    items: ProductionSourceItem[];
    insufficient: InsufficientIngredientLine[];
  } | null>(null);

  // Brief "Flour, Sugar deducted" feedback under a row right after it's
  // completed -- names, not just a count, so the baker can see what
  // actually happened without tapping anything. Cleared automatically so
  // it doesn't linger indefinitely or collide with that row's own
  // low-ingredient warning once stock re-settles.
  const [justDeducted, setJustDeducted] = useState<{ key: string; names: string[] } | null>(null);
  const justDeductedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performToggle = (row: ProductionRow, items: ProductionSourceItem[]) => {
    setPendingRowKey(row.key);
    const newStatus: 'pending' | 'done' = row.isDone ? 'pending' : 'done';
    toggleRow.mutate(
      { items, newStatus, autoDeductEnabled },
      {
        onSuccess: () => {
          const deductedNames =
            row.recipePortion != null
              ? row.recipeIngredients
                  .filter((ri) => computeIngredientAmount(ri.quantityPerBatch, row.recipePortion, row.totalQuantity) > 0)
                  .map((ri) => ri.ingredientName)
              : [];
          if (newStatus === 'done' && autoDeductEnabled && deductedNames.length > 0) {
            if (justDeductedTimeout.current) clearTimeout(justDeductedTimeout.current);
            setJustDeducted({ key: row.key, names: deductedNames });
            justDeductedTimeout.current = setTimeout(() => setJustDeducted(null), 2500);
          }
        },
        onSettled: () => setPendingRowKey(null),
      }
    );
  };

  // Tapping a row's checkbox: deduction never BLOCKS completion (a baker
  // may have substituted, bought more elsewhere, or just wants the record
  // straight) -- but if this row's own ingredients don't cover it, ask
  // first rather than silently letting stock go negative. Unchecking, and
  // completing when stock is fine, both skip the prompt entirely.
  const handleToggleRow = (row: ProductionRow) => {
    const items = rawItemsForTab.filter((item) => row.orderItemIds.includes(item.orderItemId));
    if (!row.isDone && autoDeductEnabled) {
      const insufficient = getInsufficientIngredientsForRow(row);
      if (insufficient.length > 0) {
        setConfirmRow({ row, items, insufficient });
        return;
      }
    }
    performToggle(row, items);
  };

  const handleConfirmCompleteAnyway = () => {
    if (!confirmRow) return;
    performToggle(confirmRow.row, confirmRow.items);
    setConfirmRow(null);
  };

  const activeQuery = tab === 'today' ? todayQuery : tab === 'tomorrow' ? tomorrowQuery : upcomingQuery;

  // The Ingredients tab already has its own "needs attention" filter
  // (the attentionBanner + showLowStockOnly toggle in
  // app/(tabs)/ingredients/index.tsx) -- reuse that instead of building
  // a second filtered view here. `lowStockOnly=1` mirrors the existing
  // `openAdd=1` param convention that screen already reads.
  const goToLowStock = () =>
    navigateOnce(() => router.push({ pathname: '/ingredients', params: { lowStockOnly: '1' } }));
  const goToRestock = (ingredientId: string) =>
    navigateOnce(() => router.push(`/ingredients/${ingredientId}?openRestock=1`));

  return (
    <Screen style={styles.container}>
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
                  justDeductedNames={justDeducted?.key === row.key ? justDeducted.names : null}
                  onToggle={() => handleToggleRow(row)}
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
                    justDeductedNames={justDeducted?.key === row.key ? justDeducted.names : null}
                    onToggle={() => handleToggleRow(row)}
                    onLowPress={goToLowStock}
                  />
                ))}
              </View>
            );
          })
        )}

        <View style={styles.ingredientsSection}>
          <Text style={styles.ingredientsSectionTitle}>INGREDIENTS NEEDED</Text>

          {requirements.length === 0 ? (
            <Text style={styles.emptyText}>Nothing needed yet.</Text>
          ) : (
            <>
              <IngredientStatusSection
                title="Out of stock"
                color={colors.danger}
                items={requirementGroups.insufficient}
                styles={styles}
                colors={colors}
                onRestock={goToRestock}
              />
              <IngredientStatusSection
                title="Low stock"
                color={colors.warning}
                items={requirementGroups.low}
                styles={styles}
                colors={colors}
                onRestock={goToRestock}
              />
              <IngredientStatusSection
                title="Enough on hand"
                color={colors.success}
                items={requirementGroups.enough}
                styles={styles}
                colors={colors}
              />
            </>
          )}
        </View>
      </Animated.ScrollView>

      <ConfirmDialog
        visible={!!confirmRow}
        title={confirmRow ? `Complete ${confirmRow.row.productName} (${confirmRow.row.variantName})?` : ''}
        message={confirmRow ? buildInsufficientMessage(confirmRow.insufficient) : ''}
        confirmLabel="Complete anyway"
        onConfirm={handleConfirmCompleteAnyway}
        onCancel={() => setConfirmRow(null)}
      />
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
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
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
              ...(isSelected
                ? {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 2,
                    elevation: 1,
                  }
                : null),
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                ...typography.bodySm,
                fontWeight: isSelected ? '700' : '500',
                color: isSelected ? colors.primary : colors.textSecondary,
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
  justDeductedNames,
  onToggle,
  onLowPress,
}: {
  row: ProductionRow;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  isPending: boolean;
  lowCount: number;
  justDeductedNames: string[] | null;
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
            {justDeductedNames != null ? (
              <View style={styles.rowDeductedRow}>
                <Ionicons name="checkmark-circle-outline" size={11} color={colors.success} />
                <Text style={styles.rowDeductedText} numberOfLines={1}>
                  {formatNameList(justDeductedNames)} deducted
                </Text>
              </View>
            ) : lowCount > 0 ? (
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
            <Text style={styles.ingredientMeta}>{buildIngredientMetaText(req)}</Text>
            <Text style={styles.ingredientForText} numberOfLines={1}>
              For: {formatNameList(req.neededFor.map((p) => p.productName))}
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

// Styles are built per-render from the live theme palette, same pattern
// as Ingredients/Orders/PrimaryButton — see FormField.tsx for why.
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xl,
    },
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
    rowDeductedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      alignSelf: 'flex-start',
      marginTop: spacing.xxs,
    },
    rowDeductedText: { ...typography.caption, color: colors.success, fontWeight: '600' },
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
    ingredientsSectionTitle: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '700',
      letterSpacing: 0.4,
      marginBottom: spacing.sm,
    },
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
    ingredientForText: { ...typography.caption, color: colors.textSecondary, marginTop: 1, fontStyle: 'italic' },
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
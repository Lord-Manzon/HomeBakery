import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useHideNavOnScroll } from '../../src/hooks/useHideNavOnScroll';
import { useBakerProfile } from '../../src/hooks/useBakerProfile';
import { useIngredient, useMovementHistory, useRestockIngredient } from '../../src/hooks/useIngredients';
import { RestockSheet } from '../../src/components/RestockSheet';
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
  getInsufficientIngredientsForRow,
  getRowBlockerSummary,
  groupProductionItems,
  groupProductionItemsByDate,
  type IngredientRequirement,
  type InsufficientIngredientLine,
  type ProductionIngredientStatus,
  type ProductionRow,
  type ProductionSourceItem,
  type RowBlockerSummary,
} from '../../src/services/productionLogic';
import { formatGroupHeaderDate, todayDateString, tomorrowDateString } from '../../src/utils/dateFormat';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';
import { ErrorBanner } from '../../src/components/ErrorBanner';
import { Screen } from '../../src/components/Screen';
import { radii, spacing, typography, motionDuration, motionEasing, motionSpring } from '../../src/theme';
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

/** "Cinnamon: -40 ml, Flour: -100 kg" -- the expanded view of a normal
 * deduction, once the baker taps to see amounts instead of just names. */
function buildDeductedAmountList(items: { name: string; unit: string; amount: number }[]): string {
  return items.map((i) => `${i.name}: -${formatQty(i.amount)} ${i.unit}`).join(', ');
}

/** Same resulting-negative math as the confirm dialog's
 * InsufficientIngredientsList -- deliberately identical wording/numbers
 * so a baker who saw "Cinnamon: 5 ml on hand, needs 40 ml → -35 ml" in
 * the confirm dialog sees the same "-35 ml" here, not a re-derived or
 * differently-rounded value. */
function buildShortfallSummary(lines: InsufficientIngredientLine[]): string {
  return lines.map((l) => `${l.name}: ${formatQty(l.currentStock - l.amountNeeded)} ${l.unit}`).join(', ');
}

/** Prioritizes naming what's actually blocking this row (out of stock)
 * over the less urgent low-stock count -- "Butter short · 2 low" tells
 * the baker WHAT to act on, not just a repeated number that reads the
 * same across every row regardless of which ingredients differ. */
function buildRowBlockerText(blockers: RowBlockerSummary): string | null {
  const { insufficientNames, lowCount } = blockers;
  if (insufficientNames.length === 0 && lowCount === 0) return null;
  if (insufficientNames.length === 0) {
    return `${lowCount} ingredient${lowCount === 1 ? '' : 's'} low`;
  }
  const shortText = `${formatNameList(insufficientNames)} short`;
  return lowCount > 0 ? `${shortText} · ${lowCount} low` : shortText;
}

/**
 * "For: X, Y, Z" attribution line, per ingredient row in "Ingredients
 * Needed." Stays truncated + single-line by default (this is supporting
 * context, not the primary decision on this screen -- see the "For:"
 * discussion, 2026-08-31), but the "+N more" segment is itself tappable
 * to expand in place -- same nested <Text onPress> pattern as
 * BlockedRecipesNotice on the ingredient detail screen, so a baker who
 * genuinely needs the full list isn't stuck with no way to reach it.
 */
function IngredientForText({
  products,
  styles,
}: {
  products: { productName: string; amount: number }[];
  styles: ReturnType<typeof makeStyles>;
}) {
  const [expanded, setExpanded] = useState(false);
  const names = products.map((p) => p.productName);
  const hiddenCount = names.length - 3;

  if (hiddenCount <= 0) {
    return (
      <Text style={styles.ingredientForText} numberOfLines={1}>
        For: {names.join(', ')}
      </Text>
    );
  }

  if (expanded) {
    // Plain nested <Text onPress> is fine here -- the touch-swallowing
    // bug only happens when the OUTER Text is actively truncating via
    // numberOfLines (the collapsed case below). This branch has no
    // truncation, so it just flows as normal wrapping paragraph text,
    // which also avoids the collapsed case's row-layout needing to
    // account for multi-line wrapping.
    return (
      <Text style={styles.ingredientForText}>
        For: {names.join(', ')}{' '}
        <Text style={styles.ingredientForToggle} onPress={() => setExpanded(false)}>
          Show less
        </Text>
      </Text>
    );
  }

  // NOT nested <Text onPress> inside a numberOfLines-truncated parent --
  // that combination unreliably swallows taps on Android once the outer
  // Text is actually ellipsizing (RN hit-tests truncated nested spans
  // inconsistently). Two separate elements in a row instead: the names
  // truncate on their own (flexShrink), the "+N more" Pressable sits
  // outside that truncation entirely, so it's always a real, always-
  // tappable touch target regardless of how the names line wraps.
  return (
    <View style={styles.ingredientForRow}>
      <Text style={[styles.ingredientForText, styles.ingredientForNames]} numberOfLines={1}>
        For: {names.slice(0, 3).join(', ')}
      </Text>
      <Pressable onPress={() => setExpanded(true)} hitSlop={8}>
        <Text style={styles.ingredientForToggle}> +{hiddenCount} more</Text>
      </Pressable>
    </View>
  );
}

/**
 * Replaces the old plain-text paragraph version (name/have/need/result
 * all crammed into one run-on line per ingredient, same weight/color
 * throughout -- baker feedback 2026-08-31: "hard to understand," had to
 * read every word to find the one number that mattered). Each ingredient
 * is now its own row: name on the left, the actual CONSEQUENCE (the
 * resulting negative amount -- still the thing that matters most, per
 * the 2026-08-28 decision) bold and red on the right, have/need as
 * smaller supporting text underneath.
 */
function InsufficientIngredientsList({
  lines,
  styles,
  colors,
}: {
  lines: InsufficientIngredientLine[];
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  const count = lines.length;
  return (
    <View style={styles.confirmListWrap}>
      <Text style={styles.confirmIntro}>
        {count} ingredient{count === 1 ? '' : 's'} won't fully cover this batch:
      </Text>
      {lines.map((l) => {
        const resulting = formatQty(l.currentStock - l.amountNeeded);
        return (
          <View key={l.ingredientId} style={styles.confirmRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.confirmRowName}>{l.name}</Text>
              <Text style={styles.confirmRowMeta}>
                {formatQty(l.currentStock)} {l.unit} on hand · needs {formatQty(l.amountNeeded)} {l.unit}
              </Text>
            </View>
            <Text style={styles.confirmRowResult}>
              {resulting} {l.unit}
            </Text>
          </View>
        );
      })}
      <Text style={styles.confirmFootnote}>
        You can still complete it — these will just show negative until you restock.
      </Text>
    </View>
  );
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
    willCompleteAll: boolean;
  } | null>(null);

  // Fires the one-time toast+confetti exactly when the LAST remaining
  // row gets checked off -- not on every render where percent happens
  // to equal 100 (that would replay it on every tab revisit). Cleared
  // automatically so it never lingers.
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Brief "Flour, Sugar deducted" feedback under a row right after it's
  // completed -- names, not just a count, so the baker can see what
  // actually happened without tapping anything. Cleared automatically so
  // it doesn't linger indefinitely or collide with that row's own
  // low-ingredient warning once stock re-settles.
  type JustDeductedState =
    | { key: string; kind: 'normal'; items: { ingredientId: string; name: string; unit: string; amount: number }[] }
    | { key: string; kind: 'shortfall'; lines: InsufficientIngredientLine[] };

  const [justDeducted, setJustDeducted] = useState<JustDeductedState | null>(null);
  // Only relevant for kind 'normal' -- whether the baker has tapped to
  // reveal exact amounts instead of just names. Reset every time a new
  // deduction fires so a stale expanded state never carries over.
  const [justDeductedExpanded, setJustDeductedExpanded] = useState(false);
  const justDeductedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performToggle = (
    row: ProductionRow,
    items: ProductionSourceItem[],
    willCompleteAll = false,
    shortfallLines?: InsufficientIngredientLine[]
  ) => {
    setPendingRowKey(row.key);
    const newStatus: 'pending' | 'done' = row.isDone ? 'pending' : 'done';
    toggleRow.mutate(
      { items, newStatus, autoDeductEnabled },
      {
        onSuccess: () => {
          const deductedItems =
            row.recipePortion != null
              ? row.recipeIngredients
                  .map((ri) => ({
                    ingredientId: ri.ingredientId,
                    name: ri.ingredientName,
                    unit: ri.unit,
                    amount: computeIngredientAmount(ri.quantityPerBatch, row.recipePortion, row.totalQuantity),
                  }))
                  .filter((d) => d.amount > 0)
              : [];
          if (newStatus === 'done' && autoDeductEnabled && deductedItems.length > 0) {
            if (justDeductedTimeout.current) clearTimeout(justDeductedTimeout.current);
            setJustDeductedExpanded(false);
            if (shortfallLines && shortfallLines.length > 0) {
              // Went negative -- reuse the EXACT same lines the confirm
              // dialog just showed (deterministic subtraction, same
              // numbers), shown fully expanded and colored danger rather
              // than the brief, tap-to-expand treatment normal
              // deductions get. This is the one case where "brief" isn't
              // the right call -- the baker just acknowledged a real
              // shortfall and should see the actual result.
              setJustDeducted({ key: row.key, kind: 'shortfall', lines: shortfallLines });
              justDeductedTimeout.current = setTimeout(() => setJustDeducted(null), 4000);
            } else {
              setJustDeducted({ key: row.key, kind: 'normal', items: deductedItems });
              justDeductedTimeout.current = setTimeout(() => setJustDeducted(null), 2500);
            }
          }
          if (newStatus === 'done' && willCompleteAll) {
            if (celebrationTimeout.current) clearTimeout(celebrationTimeout.current);
            // Small delay before MOUNTING the confetti -- firing it in the
            // same frame as the checkbox pop + progress bar fill + list
            // re-render was overloading the JS thread mid-animation. Letting
            // those settle first (~150ms) gives the confetti a clear frame
            // budget to run in.
            celebrationTimeout.current = setTimeout(() => {
              setShowCelebration(true);
              // Longest a single piece can run: ~120ms max random delay +
              // ~1300ms max duration ≈ 1450ms -- 1700ms gives a small buffer.
              celebrationTimeout.current = setTimeout(() => setShowCelebration(false), 1700);
            }, 150);
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
    // True only when this row is the single remaining incomplete one --
    // checked against the CURRENT progress snapshot, not a refetch, so
    // it doesn't depend on query-invalidation timing.
    const willCompleteAll = !row.isDone && progress.total > 0 && progress.completed === progress.total - 1;
    if (!row.isDone && autoDeductEnabled) {
      const insufficient = getInsufficientIngredientsForRow(row);
      if (insufficient.length > 0) {
        setConfirmRow({ row, items, insufficient, willCompleteAll });
        return;
      }
    }
    performToggle(row, items, willCompleteAll);
  };

  const handleConfirmCompleteAnyway = () => {
    if (!confirmRow) return;
    performToggle(confirmRow.row, confirmRow.items, confirmRow.willCompleteAll, confirmRow.insufficient);
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

  // Opens RestockSheet right here on Production instead of navigating to
  // the ingredient detail screen -- restocking mid-checklist is a
  // blocker-clearing action, not a deliberate "go audit this ingredient"
  // trip, so it shouldn't cost the baker their place in today's list.
  const [restockIngredientId, setRestockIngredientId] = useState<string | null>(null);
  const openRestock = (ingredientId: string) => setRestockIngredientId(ingredientId);
  const closeRestock = () => setRestockIngredientId(null);

  return (
    <Screen style={styles.container}>
      <SegmentedControl options={PRODUCTION_TABS} value={tab} onChange={setTab} styles={styles} />

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
              <ProgressBar progress={progress} colors={colors} styles={styles} />

              {progress.total > 0 && progress.percent === 100 && !showCelebration ? (
                <CompletionBanner tab={tab} styles={styles} colors={colors} />
              ) : null}

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
                  blockers={getRowBlockerSummary(row, statusByIngredientId)}
                  deductionFeedback={justDeducted?.key === row.key ? justDeducted : null}
                  deductionExpanded={justDeductedExpanded}
                  onToggleDeductionExpand={() => setJustDeductedExpanded((e) => !e)}
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
                    blockers={getRowBlockerSummary(row, statusByIngredientId)}
                    deductionFeedback={justDeducted?.key === row.key ? justDeducted : null}
                    deductionExpanded={justDeductedExpanded}
                    onToggleDeductionExpand={() => setJustDeductedExpanded((e) => !e)}
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
                onRestock={openRestock}
              />
              <IngredientStatusSection
                title="Low stock"
                color={colors.warning}
                items={requirementGroups.low}
                styles={styles}
                colors={colors}
                onRestock={openRestock}
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
        confirmLabel="Complete anyway"
        onConfirm={handleConfirmCompleteAnyway}
        onCancel={() => setConfirmRow(null)}
      >
        {confirmRow ? (
          <InsufficientIngredientsList lines={confirmRow.insufficient} styles={styles} colors={colors} />
        ) : null}
      </ConfirmDialog>

      {restockIngredientId ? (
        <ProductionRestockSheet ingredientId={restockIngredientId} onDismiss={closeRestock} />
      ) : null}

      {showCelebration ? <CompletionToast tab={tab} styles={styles} colors={colors} /> : null}
    </Screen>
  );
}

/**
 * Thin wrapper so useIngredient/useMovementHistory/useRestockIngredient
 * only mount once an ingredient id is actually selected -- keeping them
 * up in ProductionScreen would mean calling hooks with a conditionally-
 * null id on every render. Mounting/unmounting this whole component
 * instead (via `restockIngredientId ? <.../> : null` above) is the
 * correct way to make hooks conditional in React.
 */
function ProductionRestockSheet({
  ingredientId,
  onDismiss,
}: {
  ingredientId: string;
  onDismiss: () => void;
}) {
  const { data: ingredient } = useIngredient(ingredientId);
  const { data: history } = useMovementHistory(ingredientId);
  const restockIngredient = useRestockIngredient(ingredientId);

  if (!ingredient) return null;

  const lastRestockQuantity =
    history?.find((m) => m.movement_type === 'restock')?.quantity_change ?? null;

  return (
    <RestockSheet
      visible
      onDismiss={onDismiss}
      ingredient={ingredient}
      onSubmit={(input) => restockIngredient.mutate(input, { onSuccess: onDismiss })}
      isSaving={restockIngredient.isPending}
      errorMessage={restockIngredient.isError ? "Couldn't save. Try again." : null}
      lastRestockQuantity={lastRestockQuantity}
    />
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
  styles,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.segmentedRow} accessibilityRole="tablist">
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            style={styles.segmentedTab}
            hitSlop={4}
          >
            <Text numberOfLines={1} style={[styles.segmentedLabel, isSelected && styles.segmentedLabelActive]}>
              {opt.label}
            </Text>
            <View style={[styles.segmentedUnderline, isSelected && styles.segmentedUnderlineActive]} />
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
  colors,
  styles,
}: {
  progress: { completed: number; total: number; percent: number };
  colors: Record<ColorToken, string>;
  styles: ReturnType<typeof makeStyles>;
}) {
  // Animates toward the new percent on every check/uncheck instead of
  // snapping instantly -- the goal-gradient effect reads stronger when
  // the fill visibly travels rather than teleports, per docs/UI_UX_1.md.
  const fillPercent = useSharedValue(progress.percent);

  useEffect(() => {
    fillPercent.value = withTiming(progress.percent, {
      duration: motionDuration.medium,
      easing: motionEasing.decelerate,
    });
  }, [progress.percent]);

  const fillAnimStyle = useAnimatedStyle(() => ({
    width: `${fillPercent.value}%`,
  }));

  // Switches from the brand accent to success green once the bar is
  // doing STATUS duty ("this is done") rather than progress duty --
  // terracotta and danger red are close enough in hue that a full warm
  // bar sitting right above the red restock banner read ambiguous.
  // Every other "done" signal in the app (row checkmarks, the
  // completion line) is already green; this just matches that.
  const fillColorStyle = progress.percent === 100 ? { backgroundColor: colors.success } : null;

  return (
    <>
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>
          {progress.completed} of {progress.total} completed
        </Text>
        <Text style={styles.progressPercent}>{progress.percent}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, fillAnimStyle, fillColorStyle]} />
      </View>
    </>
  );
}

/**
 * Persistent, compact state shown any time the active tab's list is
 * already at 100% -- including on revisit, long after the toast
 * celebration (see CompletionToast) has faded. Deliberately quiet: a
 * full card here every time would push the still-actionable
 * RestockBanner down and lose all impact after the first viewing.
 * Suppressed while showCelebration is true (see call site) so the
 * toast's identical message never doubles up with this one.
 */
function CompletionBanner({
  tab,
  styles,
  colors,
}: {
  tab: ProductionTabKey;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  return (
    <View style={styles.completionLine}>
      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
      <Text style={styles.completionLineText}>All done for {tab === 'tomorrow' ? 'tomorrow' : 'today'}</Text>
    </View>
  );
}

const CONFETTI_WIDTH = Dimensions.get('window').width;

type ConfettiPieceConfig = {
  id: number;
  driftX: number; // final horizontal offset from origin, px
  color: string;
  delay: number;
  duration: number;
  spinDir: 1 | -1;
  size: number;
};

/**
 * One falling piece -- a small rotating rectangle that drifts sideways,
 * falls, and fades near the end. Every value lives on a shared value
 * driven by withTiming/withDelay, which Reanimated runs on the UI
 * thread -- unlike the old ConfettiCannon dependency (plain RN Animated,
 * JS-thread-driven), a handful of these stay smooth regardless of what
 * else the JS thread is doing mid-mutation.
 */
function ConfettiPiece({ config, originX }: { config: ConfettiPieceConfig; originX: number }) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Fall distance kept short (140px, was 280px) so pieces stay inside
    // the confettiOverlay band instead of falling into the restock
    // banner below it -- 2026-08-31 feedback.
    translateY.value = withDelay(
      config.delay,
      withTiming(140, { duration: config.duration, easing: motionEasing.decelerate })
    );
    translateX.value = withDelay(
      config.delay,
      withTiming(config.driftX, { duration: config.duration, easing: motionEasing.standard })
    );
    rotate.value = withDelay(
      config.delay,
      withTiming(config.spinDir * 320, { duration: config.duration, easing: motionEasing.standard })
    );
    opacity.value = withDelay(
      config.delay + config.duration * 0.6,
      withTiming(0, { duration: config.duration * 0.4 })
    );
  }, []);

  const pieceStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: originX,
    top: 0,
    width: config.size,
    height: config.size * 0.4,
    borderRadius: 2,
    backgroundColor: config.color,
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return <Animated.View style={pieceStyle} />;
}

/** A small, deliberately light burst (~18 pieces) -- "not too many" per
 * the brief. Configs are randomized once per mount via useMemo, so each
 * celebration looks slightly different without re-randomizing every
 * render. */
function ConfettiBurst({
  colors,
  styles,
}: {
  colors: Record<ColorToken, string>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const originX = CONFETTI_WIDTH / 2;
  const palette = [colors.primary, colors.success, colors.warning];
  const particles = useMemo<ConfettiPieceConfig[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        driftX: (Math.random() - 0.5) * 260,
        color: palette[i % palette.length],
        delay: Math.random() * 120,
        duration: 850 + Math.random() * 450,
        spinDir: Math.random() > 0.5 ? 1 : -1,
        size: 6 + Math.random() * 4,
      })),
    []
  );

  return (
    <View style={styles.confettiOverlay} pointerEvents="none">
      {particles.map((p) => (
        <ConfettiPiece key={p.id} config={p} originX={originX} />
      ))}
    </View>
  );
}

/**
 * The actual reward moment -- fires ONCE, right when the last row is
 * checked off (see handleToggleRow's willCompleteAll), then auto-
 * dismisses. Positioned below the segmented tabs (top: 84) so it never
 * covers Today/Tomorrow/Upcoming, and independent of ScrollView content
 * so it reads as a toast rather than a pushed-in banner and never shifts
 * anything else on screen.
 */
function CompletionToast({
  tab,
  styles,
  colors,
}: {
  tab: ProductionTabKey;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  return (
    <>
      <ConfettiBurst colors={colors} styles={styles} />
      <Animated.View
        entering={FadeInDown.duration(motionDuration.medium).easing(motionEasing.decelerate)}
        style={styles.toastWrap}
        pointerEvents="none"
      >
        <View style={styles.toastCard}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={styles.toastText}>All done for {tab === 'tomorrow' ? 'tomorrow' : 'today'}!</Text>
        </View>
      </Animated.View>
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
  blockers,
  deductionFeedback,
  deductionExpanded,
  onToggleDeductionExpand,
  onToggle,
  onLowPress,
}: {
  row: ProductionRow;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  isPending: boolean;
  blockers: RowBlockerSummary;
  deductionFeedback:
    | { key: string; kind: 'normal'; items: { ingredientId: string; name: string; unit: string; amount: number }[] }
    | { key: string; kind: 'shortfall'; lines: InsufficientIngredientLine[] }
    | null;
  deductionExpanded: boolean;
  onToggleDeductionExpand: () => void;
  onToggle: () => void;
  onLowPress: () => void;
}) {
  const press = usePressScale();
  // Same capped-stagger idea as Ingredients/Orders' list entrances, just
  // a shorter delay step -- a Production list can run longer (a busy
  // day's full bake list) and shouldn't feel slow to finish animating in.
  const delay = Math.min(index, 10) * 25;

  // Same pop language as FloatingTabBar's active-tab icon -- a quick
  // overshoot past 1.0 then spring-settle, so checking off a row reads
  // as a small satisfying "flick" rather than an instant icon swap.
  const checkScale = useSharedValue(1);
  const prevDoneRef = useRef(row.isDone);
  useEffect(() => {
    if (prevDoneRef.current !== row.isDone) {
      prevDoneRef.current = row.isDone;
      checkScale.value = withSequence(
        withTiming(1.3, { duration: 100, easing: motionEasing.decelerate }),
        withSpring(1, motionSpring.gentle)
      );
    }
  }, [row.isDone]);
  const checkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const blockerText = buildRowBlockerText(blockers);
  const hasOutOfStock = blockers.insufficientNames.length > 0;

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
            <Animated.View style={checkAnimStyle}>
              <Ionicons
                name={row.isDone ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={row.isDone ? colors.primary : colors.textSecondary}
              />
            </Animated.View>
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
            {deductionFeedback?.kind === 'shortfall' ? (
              // Went negative on "Complete anyway" -- shown fully expanded
              // and danger-colored by default, no tap needed, since this is
              // the one case where the amount genuinely matters right now.
              <View style={styles.rowDeductedRow}>
                <Ionicons name="alert-circle-outline" size={11} color={colors.danger} />
                <Text style={styles.rowDeductedTextDanger}>
                  {buildShortfallSummary(deductionFeedback.lines)}
                </Text>
              </View>
            ) : deductionFeedback?.kind === 'normal' ? (
              // Nested Pressable, not nested <Text onPress> -- same
              // touch-reliability reasoning as the "For:" fix, 2026-08-31.
              <Pressable onPress={onToggleDeductionExpand} hitSlop={6} accessibilityRole="button">
                <View style={styles.rowDeductedRow}>
                  <Ionicons name="checkmark-circle-outline" size={11} color={colors.success} />
                  <Text style={styles.rowDeductedText} numberOfLines={deductionExpanded ? undefined : 1}>
                    {deductionExpanded
                      ? buildDeductedAmountList(deductionFeedback.items)
                      : `${formatNameList(deductionFeedback.items.map((i) => i.name))} deducted`}
                  </Text>
                </View>
              </Pressable>
            ) : blockerText ? (
              // Nested inside the row's own Pressable (which toggles
              // done/not-done) -- RN gives the innermost Pressable the
              // touch, so tapping the chip opens the filtered ingredient
              // list instead of also toggling the row. Severity (danger
              // vs warning) now matches the same red/amber split used in
              // the "Ingredients Needed" section below -- previously this
              // chip always rendered amber/"low" even when the ingredient
              // was actually out of stock.
              <Pressable
                onPress={onLowPress}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${blockerText}, view list`}
                style={[styles.rowWarningChip, hasOutOfStock && styles.rowWarningChipDanger]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={11}
                  color={hasOutOfStock ? colors.danger : colors.warning}
                />
                <Text style={[styles.rowWarningText, hasOutOfStock && styles.rowWarningTextDanger]}>
                  {blockerText}
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
            <IngredientForText products={req.neededFor} styles={styles} />
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
    segmentedRow: {
      flexDirection: 'row',
      marginBottom: spacing.xl,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    segmentedTab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    segmentedLabel: {
      ...typography.bodySm,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    segmentedLabelActive: {
      color: colors.textPrimary,
    },
    segmentedUnderline: {
      height: 2,
      width: '60%',
      borderRadius: radii.full,
      marginTop: spacing.sm,
      backgroundColor: 'transparent',
    },
    segmentedUnderlineActive: {
      backgroundColor: colors.primary,
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
      marginBottom: spacing.xl,
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
      padding: spacing.md,
      marginBottom: spacing.xl,
    },
    bannerTextWrap: { flex: 1 },
    bannerTitle: { ...typography.bodySm, color: colors.danger, fontWeight: '600' },
    bannerSubtitle: { ...typography.caption, color: colors.danger, marginTop: 1 },
    bannerAction: { ...typography.bodySm, color: colors.danger, fontWeight: '600' },
    completionLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.xl,
    },
    completionLineText: { ...typography.bodySm, color: colors.success, fontWeight: '600' },
    // Fixed pixel offset rather than a spacing token -- this needs to
    // clear the segmented tabs row specifically (their height doesn't
    // map cleanly to one spacing step), not describe a general layout
    // gap. Tuned to sit just under the tabs' hairline.
    confettiOverlay: {
      position: 'absolute',
      top: 84,
      left: 0,
      right: 0,
      height: 160,
      zIndex: 19,
    },
    toastWrap: {
      position: 'absolute',
      top: 84,
      left: spacing.xl,
      right: spacing.xl,
      alignItems: 'center',
      zIndex: 20,
    },
    toastCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.full,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4,
    },
    toastText: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
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
    rowWarningChipDanger: { backgroundColor: colors.dangerMuted },
    rowWarningTextDanger: { color: colors.danger },
    rowDeductedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      alignSelf: 'flex-start',
      marginTop: spacing.xxs,
    },
    rowDeductedText: { ...typography.caption, color: colors.success, fontWeight: '600' },
    rowDeductedTextDanger: { ...typography.caption, color: colors.danger, fontWeight: '600' },
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
    ingredientsSection: { marginTop: spacing.xxl },
    ingredientsSectionTitle: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '700',
      letterSpacing: 0.4,
      marginBottom: spacing.sm,
    },
    statusGroup: { marginTop: spacing.lg },
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
    ingredientForToggle: { ...typography.caption, color: colors.primary, fontWeight: '600', fontStyle: 'normal' },
    ingredientForRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 1 },
    ingredientForNames: { flexShrink: 1, marginTop: 0 },
    restockButton: {
      backgroundColor: colors.primaryMuted,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
    },
    restockButtonText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    confirmListWrap: { marginBottom: spacing.xl },
    confirmIntro: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
    confirmRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    confirmRowName: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    confirmRowMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
    confirmRowResult: { ...typography.bodySm, color: colors.danger, fontWeight: '700' },
    confirmFootnote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md },
  });
}
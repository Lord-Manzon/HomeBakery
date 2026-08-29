import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useHideNavOnScroll } from '../../../src/hooks/useHideNavOnScroll';
import { useCreateIngredient, useIngredients, useMovementHistory, useRestockIngredient } from '../../../src/hooks/useIngredients';
import { useBakerProfile, useUpdateBakerProfile } from '../../../src/hooks/useBakerProfile';
import { usePressScale } from '../../../src/hooks/usePressScale';
import { useThemeColors } from '../../../src/theme/ThemeContext';
import { isLowStock, INGREDIENT_CATEGORIES, type Ingredient } from '../../../src/types/ingredient';
import { ErrorBanner } from '../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { IngredientFormSheet } from '../../../src/components/IngredientFormSheet';
import { GaugeSensitivitySheet } from '../../../src/components/GaugeSensitivitySheet';
import { RestockSheet } from '../../../src/components/RestockSheet';
import { Screen } from '../../../src/components/Screen';
import { getIngredientGauge, gaugeSortValue, type GaugeSensitivity } from '../../../src/services/stockGauge';
import {
  radii,
  spacing,
  typography,
  motionDuration,
  motionEasing,
  motionStagger,
} from '../../../src/theme';
import type { ColorToken } from '../../../src/theme/colors';

export default function IngredientsListScreen() {
  const router = useRouter();
  // Guards against a double-tap (or a slow re-render registering the
  // same tap twice) pushing two copies of the same detail screen onto
  // the stack. Shared across all cards in the list, not per-card, so
  // rapidly tapping two DIFFERENT cards back-to-back is also debounced.
  const isNavigatingRef = useRef(false);
  // useCallback with stable deps (router is stable, isNavigatingRef is a
  // ref) so this keeps the same identity across re-renders — needed for
  // IngredientCard's React.memo (below) to actually skip re-rendering
  // rows when unrelated screen state changes, e.g. opening the Add sheet.
  const navigateToIngredient = useCallback(
    (ingredientId: string) => {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      router.push(`/ingredients/${ingredientId}`);
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 600);
    },
    [router]
  );
  const { openAdd } = useLocalSearchParams<{ openAdd?: string }>();
  const onScroll = useHideNavOnScroll();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: ingredients, isLoading, isError, refetch } = useIngredients();
  const { data: baker } = useBakerProfile();
  const updateBakerProfile = useUpdateBakerProfile();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSensitivityOpen, setIsSensitivityOpen] = useState(false);
  // Which ingredient the "+" on a grid card was tapped for. Kept
  // separate from `isRestockOpen` (rather than nulled out on dismiss) so
  // the RestockSheet's exit animation has a valid ingredient to render
  // while it plays — same reasoning as the "forms retain stale typed
  // data" pattern noted in IngredientFormSheet.tsx.
  const [restockTarget, setRestockTarget] = useState<Ingredient | null>(null);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const openRestock = useCallback((ingredient: Ingredient) => {
    setRestockTarget(ingredient);
    setIsRestockOpen(true);
  }, []);
  const { data: restockHistory } = useMovementHistory(restockTarget?.id ?? '');
  const restockIngredientMutation = useRestockIngredient(restockTarget?.id ?? '');
  // history is sorted created_at desc (see getMovementHistory), so the
  // first 'restock' row is the most recent — matches the same lookup
  // used on the ingredient detail screen's RestockSheet.
  const lastRestockQuantity =
    restockHistory?.find((m) => m.movement_type === 'restock')?.quantity_change ?? null;
  const createIngredient = useCreateIngredient();
  const headerIconPress = usePressScale();

  // Opened via the global Quick Add card's "Add ingredient" action
  // (?openAdd=1) — see docs/DECISIONS.md's 2026-08-19 entry. Only fires
  // once per navigation, not on every re-render.
  useEffect(() => {
    if (openAdd === '1') {
      setIsAddOpen(true);
      router.setParams({ openAdd: undefined });
    }
  }, [openAdd]);

  // Defaults to 'balanced' while the baker profile is still loading, so
  // the gauge has a sensible reading immediately rather than waiting.
  const sensitivity: GaugeSensitivity = baker?.gauge_sensitivity ?? 'balanced';

  const lowStockCount = useMemo(
    () => (ingredients ?? []).filter(isLowStock).length,
    [ingredients]
  );

  // Memoized: this was previously recomputed on every render of this
  // screen, including renders that have nothing to do with the list
  // itself — e.g. setIsAddOpen(true) when tapping "Add ingredient".
  // That meant opening the Add sheet also forced a synchronous
  // triple-filter + gauge-sort pass over the whole ingredient list on
  // the JS thread, in the same tick that's supposed to just open a
  // sheet — real, blocking work sitting directly in the critical path
  // between "tap" and "sheet appears," which read as a delay followed
  // by a janky animation start once the JS thread finally freed up.
  // Now only recomputes when something that actually changes the
  // result changes.
  const filtered = useMemo(
    () =>
      (ingredients ?? [])
        .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
        .filter((i) => (selectedCategory === 'All' ? true : i.category === selectedCategory))
        .filter((i) => (showLowStockOnly ? isLowStock(i) : true))
        // Low-stock items surface first, per docs/UI_UX.md — now driven by
        // the actual gauge percentage (closer to empty sorts first) rather
        // than just the boolean isLowStock flag, so items get a meaningful
        // order within "low" too, not just low-vs-not-low.
        .sort((a, b) => gaugeSortValue(a, sensitivity) - gaugeSortValue(b, sensitivity)),
    [ingredients, search, selectedCategory, showLowStockOnly, sensitivity]
  );

  const handleAddSubmit = (input: Parameters<typeof createIngredient.mutate>[0]) => {
    createIngredient.mutate(input, {
      onSuccess: () => setIsAddOpen(false),
    });
  };

  const handleSensitivitySave = (value: GaugeSensitivity) => {
    updateBakerProfile.mutate(
      { gauge_sensitivity: value },
      { onSuccess: () => setIsSensitivityOpen(false) }
    );
  };

  const isEmpty = !ingredients || ingredients.length === 0;

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Ingredients</Text>
        <Pressable
          onPress={() => setIsSensitivityOpen(true)}
          onPressIn={headerIconPress.onPressIn}
          onPressOut={headerIconPress.onPressOut}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Stock gauge sensitivity"
        >
          <Animated.View style={[styles.headerIconButton, headerIconPress.style]}>
            <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
          </Animated.View>
        </Pressable>
      </View>

      {isLoading ? (
        <>
          {[1, 2, 3, 4].map((n) => (
            <View key={n} style={styles.skeletonCard} />
          ))}
        </>
      ) : isError ? (
        <>
          <ErrorBanner message="Couldn't load your ingredients." />
          <PrimaryButton title="Try again" onPress={() => refetch()} />
        </>
      ) : isEmpty ? (
        <Animated.View
          entering={FadeIn.duration(motionDuration.medium).easing(motionEasing.decelerate)}
          style={styles.emptyContainer}
        >
          <Text style={styles.emptyTitle}>No ingredients yet</Text>
          <Text style={styles.emptyNote}>Add one to start tracking your stock.</Text>
          <View style={styles.emptyButton}>
            <PrimaryButton title="Add ingredient" onPress={() => setIsAddOpen(true)} />
          </View>
        </Animated.View>
      ) : (
        <>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search ingredients"
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
            style={styles.categoryRow}
            contentContainerStyle={styles.categoryRowContent}
          >
            {['All', ...INGREDIENT_CATEGORIES].map((c) => (
              <CategoryChip
                key={c}
                label={c}
                isSelected={selectedCategory === c}
                styles={styles}
                onPress={() => setSelectedCategory(c)}
              />
            ))}
          </ScrollView>

          {lowStockCount > 0 && (
            <Animated.View entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}>
              <Pressable
                style={styles.attentionBanner}
                onPress={() => setShowLowStockOnly((v) => !v)}
              >
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.attentionText}>
                  {lowStockCount} ingredient{lowStockCount === 1 ? '' : 's'} need
                  {lowStockCount === 1 ? 's' : ''} attention · tap to {showLowStockOnly ? 'show all' : 'view'}
                </Text>
              </Pressable>
            </Animated.View>
          )}

          <Animated.FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.gridContent}
            ListEmptyComponent={
              <Text style={styles.noMatch}>No ingredients match "{search}"</Text>
            }
            renderItem={({ item, index }) => (
              <IngredientCard
                ingredient={item}
                sensitivity={sensitivity}
                index={index}
                styles={styles}
                colors={colors}
                onPress={navigateToIngredient}
                onRestockPress={openRestock}
              />
            )}
          />
        </>
      )}

      <IngredientFormSheet
        visible={isAddOpen}
        onDismiss={() => setIsAddOpen(false)}
        onSubmit={handleAddSubmit}
        isSaving={createIngredient.isPending}
        errorMessage={createIngredient.isError ? "Couldn't save. Try again." : null}
      />

      {restockTarget ? (
        <RestockSheet
          visible={isRestockOpen}
          onDismiss={() => setIsRestockOpen(false)}
          ingredient={restockTarget}
          onSubmit={(input) =>
            restockIngredientMutation.mutate(input, {
              onSuccess: () => setIsRestockOpen(false),
            })
          }
          isSaving={restockIngredientMutation.isPending}
          errorMessage={restockIngredientMutation.isError ? "Couldn't save. Try again." : null}
          lastRestockQuantity={lastRestockQuantity}
        />
      ) : null}

      <GaugeSensitivitySheet
        visible={isSensitivityOpen}
        onDismiss={() => setIsSensitivityOpen(false)}
        value={sensitivity}
        onSubmit={handleSensitivitySave}
        isSaving={updateBakerProfile.isPending}
      />
    </Screen>
  );
}

function CategoryChip({
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
      <Animated.View
        style={[styles.categoryChip, isSelected && styles.categoryChipSelected, press.style]}
      >
        <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const IngredientCard = memo(function IngredientCard({
  ingredient,
  sensitivity,
  index,
  styles,
  colors,
  onPress,
  onRestockPress,
}: {
  ingredient: Ingredient;
  sensitivity: GaugeSensitivity;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  /** Stable across re-renders (see navigateToIngredient's useCallback
   * above) — receives the ingredient's id rather than being a fresh
   * per-row closure, which is what lets memo() below actually prevent
   * every visible row from re-rendering (and re-running gauge math)
   * whenever unrelated screen state changes, e.g. opening the Add sheet. */
  onPress: (ingredientId: string) => void;
  /** Opens the shared RestockSheet for this card's ingredient. Also a
   * stable useCallback (see openRestock above) for the same memo()
   * reason. */
  onRestockPress: (ingredient: Ingredient) => void;
}) {
  const gauge = getIngredientGauge(ingredient, sensitivity);
  // Fill height is the actual gauge percentage — no special-casing
  // needed: out-of-stock naturally computes to 0% already (current_stock
  // <= 0), and "no alert set" has a null percent (?? 0), so both
  // naturally render with no fill. Color: yellow for low, green for
  // good — the fill itself is what shows how full the container is;
  // out-of-stock intentionally stays visually empty rather than a full
  // colored wash.
  const fillPercent = gauge.percent ?? 0;
  const fillColor = gauge.status === 'ok' ? colors.successMuted : colors.warningMuted;
  const statusLabel =
    gauge.status === 'out'
      ? 'Out of stock'
      : gauge.status === 'low'
        ? 'Low'
        : gauge.status === 'none'
          ? 'No alert set'
          : 'Good';
  const statusColor =
    gauge.status === 'out'
      ? colors.danger
      : gauge.status === 'low'
        ? colors.warning
        : gauge.status === 'none'
          ? colors.textSecondary
          : colors.success;
  const press = usePressScale();
  const addPress = usePressScale();
  // Staggered entrance per motion.ts's motionStagger — capped so a long
  // ingredient list doesn't make the last rows look sluggishly late.
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  return (
    <Animated.View
      style={styles.gridCell}
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
    >
      <Pressable onPress={() => onPress(ingredient.id)} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
        <Animated.View style={[styles.card, press.style]}>
          {fillPercent > 0 ? (
            <View
              pointerEvents="none"
              style={[styles.cardFill, { height: `${fillPercent}%`, backgroundColor: fillColor }]}
            />
          ) : null}
          <View style={styles.cardContent}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardName} numberOfLines={2}>
                {ingredient.name}
              </Text>
              <Pressable
                onPress={() => onRestockPress(ingredient)}
                onPressIn={addPress.onPressIn}
                onPressOut={addPress.onPressOut}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Restock ${ingredient.name}`}
              >
                <Animated.View style={[styles.addButton, addPress.style]}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                </Animated.View>
              </Pressable>
            </View>
            <Text style={[styles.cardStatus, { color: statusColor }]}>{statusLabel}</Text>
            <Text style={styles.cardQty}>
              {ingredient.current_stock} {ingredient.unit}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

// Styles are built per-render from the live theme palette (rather than a
// static module-level StyleSheet.create()) so the screen reacts when the
// baker changes their accent color or light/dark mode. See PrimaryButton.tsx
// and FloatingTabBar.tsx for the same pattern.
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: { ...typography.displaySm, color: colors.textPrimary },
    headerIconButton: {
      width: 44,
      height: 44,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    skeletonCard: {
      height: 64,
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
    categoryRow: { height: 40, maxHeight: 40, flexGrow: 0, flexShrink: 0, marginBottom: spacing.md },
    categoryRowContent: { flexGrow: 0, alignItems: 'flex-start', paddingRight: spacing.xl },
    categoryChip: {
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
    categoryChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    categoryChipText: { ...typography.bodySm, color: colors.textPrimary },
    categoryChipTextSelected: { color: colors.textInverse },
    attentionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.dangerMuted,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    attentionText: { ...typography.bodySm, color: colors.danger, flex: 1 },
    gridContent: { paddingBottom: spacing.xxxl + 96, gap: spacing.sm },
    gridRow: { gap: spacing.sm },
    gridCell: { flex: 1 },
    card: {
      minHeight: 128,
      borderRadius: radii.lg,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    // Absolutely positioned, bottom-anchored fill representing how full
    // the ingredient's stock is — see the fillPercent/fillColor comment
    // in IngredientCard. Sits behind cardContent; the card's own
    // `overflow: hidden` keeps it clipped to the rounded corners.
    cardFill: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    cardContent: {
      flex: 1,
      padding: spacing.md,
      justifyContent: 'space-between',
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    cardName: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '700', flex: 1 },
    addButton: {
      width: 26,
      height: 26,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}26`,
    },
    cardStatus: { ...typography.caption, fontWeight: '600' },
    cardQty: { ...typography.bodySm, color: colors.textSecondary },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.xs },
    emptyNote: {
      ...typography.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    emptyButton: { width: '100%' },
    noMatch: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  });
}
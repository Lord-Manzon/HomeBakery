import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useHideNavOnScroll } from '../../../../src/hooks/useHideNavOnScroll';
import { useCreateIngredient, useIngredients } from '../../../../src/hooks/useIngredients';
import { useBakerProfile, useUpdateBakerProfile } from '../../../../src/hooks/useBakerProfile';
import { usePressScale } from '../../../../src/hooks/usePressScale';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { isLowStock, INGREDIENT_CATEGORIES, type Ingredient } from '../../../../src/types/ingredient';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { IngredientFormSheet } from '../../../../src/components/IngredientFormSheet';
import { GaugeSensitivitySheet } from '../../../../src/components/GaugeSensitivitySheet';
import { StockGauge } from '../../../../src/components/StockGauge';
import { Screen } from '../../../../src/components/Screen';
import { getIngredientGauge, gaugeSortValue, type GaugeSensitivity } from '../../../../src/services/stockGauge';
import { getCategoryIcon } from '../../../../src/utils/ingredientCategoryIcon';
import {
  radii,
  spacing,
  typography,
  motionDuration,
  motionEasing,
  motionStagger,
} from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';

export default function IngredientsListScreen() {
  const router = useRouter();
  // Guards against a double-tap (or a slow re-render registering the
  // same tap twice) pushing two copies of the same detail screen onto
  // the stack. Shared across all cards in the list, not per-card, so
  // rapidly tapping two DIFFERENT cards back-to-back is also debounced.
  const isNavigatingRef = useRef(false);
  const navigateToIngredient = (ingredientId: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    router.push(`/more/ingredients/${ingredientId}`);
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 600);
  };
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

  const lowStockCount = (ingredients ?? []).filter(isLowStock).length;

  const filtered = (ingredients ?? [])
    .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    .filter((i) => (selectedCategory === 'All' ? true : i.category === selectedCategory))
    .filter((i) => (showLowStockOnly ? isLowStock(i) : true))
    // Low-stock items surface first, per docs/UI_UX.md — now driven by
    // the actual gauge percentage (closer to empty sorts first) rather
    // than just the boolean isLowStock flag, so items get a meaningful
    // order within "low" too, not just low-vs-not-low.
    .sort((a, b) => gaugeSortValue(a, sensitivity) - gaugeSortValue(b, sensitivity));

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

  if (isLoading) {
    return (
      <Screen style={styles.container}>
        <Text style={styles.title}>Ingredients</Text>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={styles.skeletonCard} />
        ))}
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen style={styles.container}>
        <Text style={styles.title}>Ingredients</Text>
        <ErrorBanner message="Couldn't load your ingredients." />
        <PrimaryButton title="Try again" onPress={() => refetch()} />
      </Screen>
    );
  }

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

      {isEmpty ? (
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
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: spacing.xxxl + 96 }}
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
                onPress={() => navigateToIngredient(item.id)}
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

function IngredientCard({
  ingredient,
  sensitivity,
  index,
  styles,
  colors,
  onPress,
}: {
  ingredient: Ingredient;
  sensitivity: GaugeSensitivity;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onPress: () => void;
}) {
  const lowStock = isLowStock(ingredient);
  const gauge = getIngredientGauge(ingredient, sensitivity);
  const iconName = getCategoryIcon(ingredient.category);
  const tintColor =
    gauge.status === 'out' ? colors.danger : gauge.status === 'low' ? colors.warning : colors.success;
  const press = usePressScale();
  // Staggered entrance per motion.ts's motionStagger — capped so a long
  // ingredient list doesn't make the last rows look sluggishly late.
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
    >
      <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
        <Animated.View style={[styles.card, gauge.status === 'out' && styles.cardOut, press.style]}>
          <View style={styles.cardTopRow}>
            <View style={[styles.iconTile, { backgroundColor: `${tintColor}1F` }]}>
              <Ionicons name={iconName} size={16} color={tintColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{ingredient.name}</Text>
              {ingredient.category ? (
                <Text style={styles.cardCategory}>{ingredient.category}</Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.cardStock}>
                {ingredient.current_stock} {ingredient.unit}
              </Text>
              {lowStock ? (
                <View style={styles.lowStockBadge}>
                  <Text style={styles.lowStockBadgeText}>
                    {gauge.status === 'out' ? 'Out of stock' : 'Low stock'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <StockGauge percent={gauge.percent} status={gauge.status} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

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
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardOut: {
      borderColor: colors.danger,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    iconTile: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    cardCategory: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
    cardStock: { ...typography.body, color: colors.textPrimary },
    lowStockBadge: {
      backgroundColor: colors.dangerMuted,
      borderRadius: radii.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      marginTop: spacing.xxs,
    },
    lowStockBadgeText: { ...typography.caption, color: colors.danger },
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
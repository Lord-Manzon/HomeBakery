import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRecipes } from '../../../src/hooks/useRecipes';
import { useNavigateOnce } from '../../../src/hooks/useNavigateOnce';
import { usePressScale } from '../../../src/hooks/usePressScale';
import { useThemeColors } from '../../../src/theme/ThemeContext';
import { ErrorBanner } from '../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { Screen } from '../../../src/components/Screen';
import {
  spacing,
  radii,
  typography,
  motionDuration,
  motionEasing,
  motionStagger,
} from '../../../src/theme';
import type { ColorToken } from '../../../src/theme/colors';
import type { Recipe } from '../../../src/types/recipe';

/**
 * Standalone Recipes list, separate from any one product — per
 * docs/DECISIONS.md's 2026-08-18 entry: "Product = what I sell, Recipe =
 * how I make it." A recipe can be linked from multiple product variants
 * (see the "used in" list on the detail screen), and this list exists so
 * a baker can browse/manage recipes on their own terms, independent of
 * which products currently use them — the Product -> "Recipe & costing"
 * shortcut on a specific variant still exists separately and is NOT
 * replaced by this screen (see UI_UX_1.md section 6).
 *
 * VISUAL REDESIGN (2026-08-27): dropped the boxed-per-row-card look
 * (individual bordered/shadowed cards, colored initials tile) for ONE
 * grouped, rounded/bordered container with hairline dividers between
 * rows. The group is now an outer View so the container hugs its actual
 * row count instead of stretching to fill the screen when there are
 * only a couple recipes, while still scrolling normally once content
 * overflows.
 */
export default function RecipesListScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: recipes, isLoading, isError, refetch } = useRecipes();
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    if (!search.trim()) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [recipes, search]);

  const isEmptyCatalog = !recipes || recipes.length === 0;

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
              placeholder="Search recipes"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
          </>
        ) : (
          <>
            <Text style={styles.title}>Recipes</Text>
            <Pressable
              onPress={() => setIsSearchOpen(true)}
              style={styles.iconButton}
              accessibilityLabel="Search recipes"
            >
              <Ionicons name="search" size={20} color={colors.textPrimary} />
            </Pressable>
          </>
        )}
      </View>

      {!isSearchOpen && !isEmptyCatalog ? (
        <Text style={styles.helperLine}>Your bakery recipes and production costs.</Text>
      ) : null}

      {isError ? (
        <View style={styles.centerBlock}>
          <ErrorBanner message="Couldn't load your recipes." />
          <PrimaryButton title="Retry" onPress={() => refetch()} />
        </View>
      ) : isLoading ? (
        <View style={styles.group}>
          {[1, 2, 3].map((i, idx) => (
            <View key={i} style={[styles.skeletonRow, idx !== 2 && styles.rowDivider]} />
          ))}
        </View>
      ) : isEmptyCatalog ? (
        <View style={styles.centerBlock}>
          <Ionicons name="restaurant-outline" size={40} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No recipes yet</Text>
          <Text style={styles.emptyBody}>
            A recipe holds your ingredients and quantities — link it to a product variant to see
            its cost and a suggested price.
          </Text>
          <PrimaryButton title="Add your first recipe" onPress={() => router.push('/recipes/new')} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centerBlock}>
          <Text style={styles.emptyBody}>No recipes match "{search}".</Text>
          <Pressable onPress={() => setSearch('')}>
            <Text style={styles.clearSearch}>Clear search</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.group}>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => (
              <RecipeRow
                recipe={item}
                index={index}
                isLast={index === filtered.length - 1}
                styles={styles}
                colors={colors}
              />
            )}
          />
        </View>
      )}
    </Screen>
  );
}

function pluralizeUnit(quantity: number, unit: string) {
  // Lowercased for display only — recipe.yield_unit is left exactly
  // as stored; NAIVE pluralization otherwise (fine for "roll",
  // "slice", "batch"; flag if an irregular unit needs handling).
  const lower = unit.toLowerCase();
  return quantity === 1 ? lower : `${lower}s`;
}

function RecipeRow({
  recipe,
  index,
  isLast,
  styles,
  colors,
}: {
  recipe: Recipe;
  index: number;
  isLast: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  const navigateOnce = useNavigateOnce();
  const press = usePressScale();
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  // Cost still not available on the list query — leave null for now
  const costLine: string | null = null;

  // Real used-in count from getRecipes()
  const usedInCount = (recipe as Recipe & { used_in_count: number }).used_in_count ?? 0;
  const usedInLine =
    usedInCount === 0
      ? 'Not linked to any product'
      : usedInCount === 1
        ? 'Used in 1 product'
        : `Used in ${usedInCount} products`;

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium)
        .delay(delay)
        .easing(motionEasing.decelerate)}
    >
      <Pressable
        onPress={() => navigateOnce(`/recipes/${recipe.id}`)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Animated.View style={[styles.row, !isLast && styles.rowDivider, press.style]}>
          <View style={styles.rowBody}>
            <Text style={styles.rowName}>{recipe.name}</Text>

            <Text style={styles.rowMeta}>
              Yield: {recipe.yield_quantity}{' '}
              {pluralizeUnit(recipe.yield_quantity, recipe.yield_unit)}
              {costLine ? ` · ${costLine}` : null}
            </Text>

            <Text
              style={[
                styles.rowUsedIn,
                usedInCount === 0 && styles.rowUsedInMuted,
              ]}
            >
              {usedInLine}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: spacing.xl },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    title: {
  fontSize: 28,           // or typography.titleXl if you have it
  lineHeight: 34,
  fontWeight: '800',
  letterSpacing: -0.3,    // slightly tighter looks more modern
  color: colors.textPrimary,
},
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    helperLine: {
  ...typography.bodySm,
  color: colors.textSecondary,
  marginTop: -2,          // pulls it closer to the title
  marginBottom: spacing.lg,
},
    searchInputInline: {
      flex: 1,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
      paddingHorizontal: spacing.sm,
    },
    group: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      overflow: 'hidden',
      // No flex / flexGrow — this lets the container hug its content
      alignSelf: 'stretch',
    },
    listContent: {
      // Explicitly prevent the content from growing to fill the screen
      flexGrow: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      // Slightly more breathing room than the original spacing.md,
      // still compact enough for scanning a working ingredient/recipe
      // list quickly.
      paddingVertical: spacing.md + spacing.xxs,
      paddingHorizontal: spacing.md,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowBody: { flex: 1 },
    rowName: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
    rowMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xxs },
    rowCost: { ...typography.bodySm, color: colors.primary, fontWeight: '600', marginTop: spacing.xxs },
    rowUsedIn: {
      ...typography.bodySm,
      color: colors.textSecondary,
      marginTop: spacing.xxs,
    },
    rowUsedInMuted: {
      color: colors.textSecondary,
      fontStyle: 'italic',
      opacity: 0.7,
    },
    skeletonRow: { height: 60, backgroundColor: colors.surfaceMuted },
    centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
    emptyTitle: { ...typography.titleLg, color: colors.textPrimary },
    emptyBody: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
    clearSearch: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
  });
}
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
import { getRecipeVisual } from '../../../src/utils/recipeVisual';
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
        <Text style={styles.helperLine}>Tap a recipe to see its ingredients and cost.</Text>
      ) : null}

      {isError ? (
        <View style={styles.centerBlock}>
          <ErrorBanner message="Couldn't load your recipes." />
          <PrimaryButton title="Retry" onPress={() => refetch()} />
        </View>
      ) : isLoading ? (
        <View style={styles.list}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.card, styles.skeletonCard]} />
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
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <RecipeCard recipe={item} index={index} styles={styles} colors={colors} />
          )}
        />
      )}
    </Screen>
  );
}

function RecipeCard({
  recipe,
  index,
  styles,
  colors,
}: {
  recipe: Recipe;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  const navigateOnce = useNavigateOnce();
  const press = usePressScale();
  const visual = getRecipeVisual(recipe.name);
  // Staggered entrance per motion.ts's motionStagger — capped so a long
  // list doesn't make the last rows look sluggishly late (same pattern
  // as the Ingredients list).
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
    >
      <Pressable
        onPress={() => navigateOnce(`/recipes/${recipe.id}`)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Animated.View style={[styles.card, press.style]}>
          <View style={[styles.cardIconTile, { backgroundColor: `${visual.color}1F` }]}>
            <Text style={[styles.cardIconTileText, { color: visual.color }]}>{visual.initials}</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardName}>{recipe.name}</Text>
            <Text style={styles.cardMeta}>
              Yields {recipe.yield_quantity} {recipe.yield_unit}
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
    title: { ...typography.titleLg, color: colors.textPrimary },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    helperLine: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    searchInputInline: {
      flex: 1,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
      paddingHorizontal: spacing.sm,
    },
    list: { paddingBottom: spacing.xxxl },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    skeletonCard: { height: 64, backgroundColor: colors.surfaceMuted, borderWidth: 0 },
    cardIconTile: {
      width: 36,
      height: 36,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardIconTileText: { ...typography.bodySm, fontWeight: '700' },
    cardBody: { flex: 1 },
    cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    cardMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xxs },
    centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
    emptyTitle: { ...typography.titleLg, color: colors.textPrimary },
    emptyBody: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
    clearSearch: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
  });
}
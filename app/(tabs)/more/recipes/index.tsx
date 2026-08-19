import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRecipes } from '../../../../src/hooks/useRecipes';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { Screen } from '../../../../src/components/Screen';
import { spacing, radii, typography } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import type { Recipe } from '../../../../src/types/recipe';

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
        <Text style={styles.title}>Recipes</Text>
        <Pressable
          onPress={() => setIsSearchOpen((v) => !v)}
          style={styles.iconButton}
          accessibilityLabel="Search recipes"
        >
          <Ionicons name="search" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {isSearchOpen ? (
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
      ) : !isEmptyCatalog ? (
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
          <PrimaryButton title="Add your first recipe" onPress={() => router.push('/more/recipes/new')} />
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
          renderItem={({ item }) => <RecipeCard recipe={item} styles={styles} colors={colors} />}
        />
      )}

      {!isEmptyCatalog ? (
        <Pressable onPress={() => router.push('/more/recipes/new')} style={styles.fab}>
          <Ionicons name="add" size={28} color={colors.textInverse} />
        </Pressable>
      ) : null}
    </Screen>
  );
}

function RecipeCard({
  recipe,
  styles,
  colors,
}: {
  recipe: Recipe;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  const router = useRouter();
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/more/recipes/${recipe.id}`)}>
      <View style={styles.cardIconTile}>
        <Ionicons name="restaurant-outline" size={18} color={colors.primary} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{recipe.name}</Text>
        <Text style={styles.cardMeta}>
          Yields {recipe.yield_quantity} {recipe.yield_unit}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
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
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      marginBottom: spacing.lg,
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
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1 },
    cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    cardMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xxs },
    centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
    emptyTitle: { ...typography.titleLg, color: colors.textPrimary },
    emptyBody: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
    clearSearch: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    fab: {
      position: 'absolute',
      right: spacing.xl,
      bottom: spacing.xl,
      width: 56,
      height: 56,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 3,
    },
  });
}

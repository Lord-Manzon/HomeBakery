import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProduct, useUpdateVariantRecipeLink, useUpdateVariantSuggestedPrice, useVariants } from '../../../../../src/hooks/useProducts';
import { useRecipe, useRecipes } from '../../../../../src/hooks/useRecipes';
import { useBakerProfile } from '../../../../../src/hooks/useBakerProfile';
import { useThemeColors } from '../../../../../src/theme/ThemeContext';
import {
  calculateActualMarginPercent,
  calculateProfit,
  calculateVariantCost,
  calculateSuggestedPrice,
  resolveMarginPercent,
} from '../../../../../src/services/costing';
import { BottomSheet } from '../../../../../src/components/BottomSheet';
import { ErrorBanner } from '../../../../../src/components/ErrorBanner';
import { FormField } from '../../../../../src/components/FormField';
import { PrimaryButton } from '../../../../../src/components/PrimaryButton';
import { Screen } from '../../../../../src/components/Screen';
import { formatCurrency } from '../../../../../src/utils/currency';
import { spacing, radii, typography } from '../../../../../src/theme';
import type { ColorToken } from '../../../../../src/theme/colors';
import type { Recipe } from '../../../../../src/types/recipe';

/**
 * Real Phase 6 implementation, replacing the Phase 4 placeholder (see
 * docs/DECISIONS.md's 2026-08-15 entry for that placeholder, and the
 * 2026-08-19 entry for this one). Links this variant to a recipe (from
 * the standalone Recipes catalog — see docs/DECISIONS.md's 2026-08-18
 * entry on the Product/Recipe separation), sets this variant's own
 * recipe_portion and margin override, and shows a live cost breakdown.
 * Ingredient management itself lives on the recipe's own detail screen
 * (/more/recipes/[id]) — this screen is about how THIS variant uses that
 * recipe, not about editing the recipe.
 */
export default function RecipeAndCostingScreen() {
  const { id, variantId } = useLocalSearchParams<{ id: string; variantId: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: product, isLoading: isLoadingProduct, isError: isProductError } = useProduct(id);
  const { data: variants, isLoading: isLoadingVariants } = useVariants(id);
  const { data: baker } = useBakerProfile();
  const { data: allRecipes } = useRecipes();

  const variant = variants?.find((v) => v.id === variantId);
  const { data: linkedRecipe } = useRecipe(variant?.recipe_id ?? '');

  const updateLink = useUpdateVariantRecipeLink(id);
  const updateSuggestedPrice = useUpdateVariantSuggestedPrice(id);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [portionDraft, setPortionDraft] = useState('');
  const [marginDraft, setMarginDraft] = useState('');
  const [portionError, setPortionError] = useState<string | null>(null);
  const [marginError, setMarginError] = useState<string | null>(null);

  useEffect(() => {
    if (variant) {
      setPortionDraft(variant.recipe_portion != null ? String(variant.recipe_portion) : '');
      setMarginDraft(variant.margin_percent != null ? String(variant.margin_percent) : '');
    }
  }, [variant?.id, variant?.recipe_portion, variant?.margin_percent]);

  const isLoading = isLoadingProduct || isLoadingVariants;

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (isProductError || !product || !variant) {
    return (
      <Screen>
        <ErrorBanner message="Couldn't load this product or variant." />
      </Screen>
    );
  }

  const parsedPortion = portionDraft ? Number(portionDraft) : null;
  const parsedMargin = marginDraft ? Number(marginDraft) : null;

  const cost =
    linkedRecipe && parsedPortion != null
      ? calculateVariantCost(linkedRecipe, { recipe_portion: parsedPortion, packaging_cost: variant.packaging_cost })
      : variant.packaging_cost;

  const resolvedMargin = resolveMarginPercent(
    { margin_percent: parsedMargin },
    { margin_percent: product.margin_percent },
    { margin_percent: linkedRecipe?.margin_percent ?? null },
    { default_margin_percent: baker?.default_margin_percent ?? 0 }
  );

  const suggestedPrice = calculateSuggestedPrice(cost, resolvedMargin);
  const actualProfit = calculateProfit(variant.selling_price, cost);
  const actualMargin = calculateActualMarginPercent(variant.selling_price, cost);
  const isNegative = actualProfit < 0;

  const handleLinkRecipe = (recipe: Recipe | null) => {
    setIsPickerOpen(false);
    updateLink.mutate(
      {
        variantId: variant.id,
        input: {
          recipe_id: recipe?.id ?? null,
          recipe_portion: recipe ? variant.recipe_portion ?? 1 : null,
          margin_percent: variant.margin_percent,
        },
      },
      {
        onSuccess: () => {
          if (recipe) setPortionDraft(String(variant.recipe_portion ?? 1));
        },
      }
    );
  };

  const handleSaveDetails = () => {
    if (parsedPortion != null && parsedPortion <= 0) {
      setPortionError('Enter a portion above 0');
      return;
    }
    if (parsedMargin != null && parsedMargin >= 100) {
      setMarginError('Must be below 100%');
      return;
    }
    setPortionError(null);
    setMarginError(null);

    updateLink.mutate(
      {
        variantId: variant.id,
        input: {
          recipe_id: variant.recipe_id,
          recipe_portion: parsedPortion,
          margin_percent: parsedMargin,
        },
      },
      {
        onSuccess: () => {
          // Persist the freshly computed suggestion for reference/history,
          // per docs/DATABASE.md — never a baker-typed value.
          updateSuggestedPrice.mutate({ variantId: variant.id, suggestedPrice: suggestedPrice });
        },
      }
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Recipe & costing
        </Text>
        <View style={styles.iconButton} />
      </View>

      <Text style={styles.subtitle}>
        {product.name} — {variant.name}
      </Text>

      <ScrollView showsVerticalScrollIndicator={false}>
        {!variant.recipe_id ? (
          <View style={styles.noRecipeCard}>
            <Ionicons name="restaurant-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.noRecipeTitle}>No recipe linked yet</Text>
            <Text style={styles.noRecipeBody}>
              Link a recipe from your Recipes catalog to see this variant's cost and a suggested
              price.
            </Text>
            <View style={styles.noRecipeActions}>
              <PrimaryButton title="Link a recipe" onPress={() => setIsPickerOpen(true)} />
              <Pressable onPress={() => router.push('/more/recipes/new')}>
                <Text style={styles.newRecipeLink}>Or create a new recipe</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Pressable
              style={styles.recipeLinkRow}
              onPress={() => router.push(`/more/recipes/${variant.recipe_id}`)}
            >
              <View style={styles.recipeLinkIconTile}>
                <Ionicons name="restaurant-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.recipeLinkBody}>
                <Text style={styles.recipeLinkName}>{linkedRecipe?.name ?? 'Loading…'}</Text>
                <Text style={styles.recipeLinkMeta}>
                  {linkedRecipe ? `Yields ${linkedRecipe.yield_quantity} ${linkedRecipe.yield_unit}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => setIsPickerOpen(true)}>
              <Text style={styles.changeLink}>Change recipe</Text>
            </Pressable>

            <View style={styles.row}>
              <View style={styles.rowField}>
                <FormField
                  label="Portion of one batch"
                  placeholder="e.g. 0.25"
                  keyboardType="decimal-pad"
                  value={portionDraft}
                  onChangeText={setPortionDraft}
                  error={portionError ?? undefined}
                />
              </View>
              <View style={styles.rowField}>
                <FormField
                  label="Margin override (optional)"
                  placeholder="Uses resolved default"
                  keyboardType="decimal-pad"
                  value={marginDraft}
                  onChangeText={setMarginDraft}
                  error={marginError ?? undefined}
                />
              </View>
            </View>
            <Text style={styles.hint}>
              e.g. 0.25 = this variant uses a quarter of one full recipe batch. Margin resolves
              variant → product → recipe → your baker default, per docs/DATABASE.md.
            </Text>

            <View style={styles.costCard}>
              <CostRow label="Ingredient + packaging cost" value={formatCurrency(cost, baker?.currency)} colors={colors} />
              <CostRow label="Margin used" value={`${resolvedMargin}%`} colors={colors} />
              <CostRow
                label="Suggested price"
                value={suggestedPrice != null ? formatCurrency(suggestedPrice, baker?.currency) : '—'}
                colors={colors}
                emphasize
              />
              <View style={styles.costDivider} />
              <CostRow label="Your selling price" value={formatCurrency(variant.selling_price, baker?.currency)} colors={colors} />
              <CostRow
                label="Actual profit"
                value={formatCurrency(actualProfit, baker?.currency)}
                colors={colors}
                danger={isNegative}
              />
              <CostRow
                label="Actual margin"
                value={actualMargin != null ? `${actualMargin.toFixed(1)}%` : '—'}
                colors={colors}
                danger={isNegative}
              />
            </View>

            {updateLink.isError || updateSuggestedPrice.isError ? (
              <ErrorBanner message="Couldn't save. Try again." />
            ) : null}

            <View style={styles.saveButton}>
              <PrimaryButton
                title="Save"
                onPress={handleSaveDetails}
                isLoading={updateLink.isPending || updateSuggestedPrice.isPending}
              />
            </View>
          </>
        )}
      </ScrollView>

      <RecipePickerSheet
        visible={isPickerOpen}
        recipes={allRecipes ?? []}
        onDismiss={() => setIsPickerOpen(false)}
        onSelect={handleLinkRecipe}
        colors={colors}
      />
    </Screen>
  );
}

function CostRow({
  label,
  value,
  colors,
  emphasize,
  danger,
}: {
  label: string;
  value: string;
  colors: Record<ColorToken, string>;
  emphasize?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
      <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>{label}</Text>
      <Text
        style={{
          ...typography.bodySm,
          color: danger ? colors.danger : emphasize ? colors.primary : colors.textPrimary,
          fontWeight: emphasize || danger ? '700' : '600',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function RecipePickerSheet({
  visible,
  recipes,
  onDismiss,
  onSelect,
  colors,
}: {
  visible: boolean;
  recipes: Recipe[];
  onDismiss: () => void;
  onSelect: (recipe: Recipe | null) => void;
  colors: Record<ColorToken, string>;
}) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <Text style={{ ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.md }}>
        Link a recipe
      </Text>
      {recipes.length === 0 ? (
        <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
          You don't have any recipes yet.
        </Text>
      ) : (
        // Plain map, not FlatList — BottomSheet already wraps its
        // children in a ScrollView (for the Android keyboard fix, see
        // docs/DECISIONS.md's 2026-08-17/18 entries), and nesting a
        // VirtualizedList inside a ScrollView of the same orientation is
        // an RN error, not just a warning. A baker's recipe count is
        // small enough that this doesn't need its own virtualization.
        <View>
          {recipes.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item)}
              style={{
                paddingVertical: spacing.sm + 2,
                paddingHorizontal: spacing.sm,
                borderRadius: radii.md,
              }}
            >
              <Text style={{ ...typography.body, color: colors.textPrimary }}>{item.name}</Text>
              <Text style={{ ...typography.caption, color: colors.textSecondary }}>
                Yields {item.yield_quantity} {item.yield_unit}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: spacing.xl },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    iconButton: { width: 44, height: 44, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center' },
    title: { ...typography.titleLg, color: colors.textPrimary, flex: 1, textAlign: 'center' },
    subtitle: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
    noRecipeCard: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
      padding: spacing.xxl,
    },
    noRecipeTitle: { ...typography.titleSm, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.xs, textAlign: 'center' },
    noRecipeBody: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
    noRecipeActions: { width: '100%', alignItems: 'center', gap: spacing.md },
    newRecipeLink: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    recipeLinkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.xs,
    },
    recipeLinkIconTile: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    recipeLinkBody: { flex: 1 },
    recipeLinkName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    recipeLinkMeta: { ...typography.bodySm, color: colors.textSecondary },
    changeLink: { ...typography.bodySm, color: colors.primary, fontWeight: '600', marginBottom: spacing.lg },
    row: { flexDirection: 'row', gap: spacing.md },
    rowField: { flex: 1 },
    hint: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.lg },
    costCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    costDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
    saveButton: { marginBottom: spacing.xxxl },
  });
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProduct, useUpdateVariant, useUpdateVariantRecipeLink, useUpdateVariantSuggestedPrice, useVariants } from '../../../../src/hooks/useProducts';
import { useRecipe, useRecipes } from '../../../../src/hooks/useRecipes';
import { useBakerProfile } from '../../../../src/hooks/useBakerProfile';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import {
  calculateActualMarginPercent,
  calculateProfit,
  calculateVariantCost,
  calculateSuggestedPrice,
  resolveMarginPercent,
} from '../../../../src/services/costing';
import { BottomSheet } from '../../../../src/components/BottomSheet';
import { ConfirmDialog } from '../../../../src/components/ConfirmDialog';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { SuccessBanner } from '../../../../src/components/SuccessBanner';
import { FormField } from '../../../../src/components/FormField';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { Screen } from '../../../../src/components/Screen';
import { formatCurrency } from '../../../../src/utils/currency';
import { getRecipeVisual } from '../../../../src/utils/recipeVisual';
import { spacing, radii, typography } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import type { Recipe } from '../../../../src/types/recipe';

/**
 * Real Phase 6 implementation, replacing the Phase 4 placeholder (see
 * docs/DECISIONS.md's 2026-08-15 entry for that placeholder, and the
 * 2026-08-19 entry for this one). Links this variant to a recipe (from
 * the standalone Recipes catalog — see docs/DECISIONS.md's 2026-08-18
 * entry on the Product/Recipe separation), sets this variant's own
 * recipe_portion and margin override, and shows a live cost breakdown.
 * Ingredient management itself lives on the recipe's own detail screen
 * (/recipes/[id]) — this screen is about how THIS variant uses that
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
  const updateVariant = useUpdateVariant(id);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isVariantSwitcherOpen, setIsVariantSwitcherOpen] = useState(false);
  const [portionDraft, setPortionDraft] = useState('');
  const [marginDraft, setMarginDraft] = useState('');
  const [portionError, setPortionError] = useState<string | null>(null);
  const [marginError, setMarginError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  // Clear any pending auto-dismiss timer if the screen unmounts mid-countdown
  // (e.g. baker taps back right after saving) — otherwise it fires setState
  // on an unmounted component.
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

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

  // Compares live drafts against the last-saved values (the same valuescc
  // the useEffect above seeds the drafts with) to detect unsaved edits.
  const isDirty =
    portionDraft !== (variant.recipe_portion != null ? String(variant.recipe_portion) : '') ||
    marginDraft !== (variant.margin_percent != null ? String(variant.margin_percent) : '');

  const confirmOrRun = (action: () => void) => {
    if (isDirty) {
      setPendingNav(() => action);
    } else {
      action();
    }
  };

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

  const handleSyncSellingPrice = () => {
    if (suggestedPrice == null) return;
    // Reuses the same update path the variant edit form uses — name and
    // packaging_cost are required by variantFormSchema even though only
    // selling_price is changing here, so we pass the variant's current
    // values through unchanged.
    updateVariant.mutate({
      variantId: variant.id,
      input: { name: variant.name, selling_price: suggestedPrice, packaging_cost: variant.packaging_cost },
    });
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
          updateSuggestedPrice.mutate(
            { variantId: variant.id, suggestedPrice: suggestedPrice },
            {
              onSuccess: () => {
                // No navigation on purpose — this screen's value is watching
                // Suggested price / Actual profit update live as portion or
                // margin change, so we let the baker keep looking at the
                // breakdown and back out manually when they're satisfied.
                if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
                setShowSaved(true);
                savedTimeoutRef.current = setTimeout(() => setShowSaved(false), 2500);
              },
            }
          );
        },
      }
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => confirmOrRun(() => router.back())} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Recipe & costing
        </Text>
        <View style={styles.iconButton} />
      </View>

      <Pressable
        style={styles.subtitleRow}
        onPress={() => (variants && variants.length > 1 ? setIsVariantSwitcherOpen(true) : undefined)}
        accessibilityLabel="Switch variant"
      >
        <Text style={styles.subtitle} numberOfLines={1}>
          {product.name} — {variant.name}
        </Text>
        {variants && variants.length > 1 ? (
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        ) : null}
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl + 96 }}>
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
              <Pressable onPress={() => router.push('/recipes/new')}>
                <Text style={styles.newRecipeLink}>Or create a new recipe</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Pressable
              style={styles.recipeLinkRow}
              onPress={() => router.push(`/products/${id}/recipe-view?recipeId=${variant.recipe_id}`)}
            >
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
              e.g. 0.25 means this variant uses a quarter of one full recipe batch. If you don't
              set a margin here, it falls back to this product's margin, then the recipe's, then
              your default.
            </Text>

            <View style={styles.costCard}>
              <CostRow label="Ingredient + packaging cost" value={formatCurrency(cost, baker?.currency)} colors={colors} />
              <CostRow label="Margin used" value={`${resolvedMargin}%`} colors={colors} />
              <CostRow
                label="Suggested price"
                value={suggestedPrice != null ? formatCurrency(suggestedPrice, baker?.currency) : '—'}
                colors={colors}
                emphasize={!isNegative}
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
              {isNegative && suggestedPrice != null ? (
                <Pressable
                  onPress={handleSyncSellingPrice}
                  style={styles.syncPriceRow}
                  disabled={updateVariant.isPending}
                >
                  <Ionicons name="arrow-up-circle-outline" size={16} color={colors.primary} />
                  <Text style={styles.syncPriceText}>
                    Update selling price to {formatCurrency(suggestedPrice, baker?.currency)}
                  </Text>
                  {updateVariant.isPending ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : null}
                </Pressable>
              ) : null}
            </View>

            {updateLink.isError || updateSuggestedPrice.isError ? (
              <ErrorBanner message="Couldn't save. Try again." />
            ) : null}

            {showSaved ? <SuccessBanner message="Saved" /> : null}

            <View style={styles.saveButton}>
              <PrimaryButton
                title={isNegative ? 'Save (selling at a loss)' : 'Save'}
                onPress={handleSaveDetails}
                isLoading={updateLink.isPending || updateSuggestedPrice.isPending}
                variant={isNegative ? 'danger' : 'primary'}
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

      <ConfirmDialog
        visible={pendingNav != null}
        title="Discard changes?"
        message="Your portion or margin edits haven't been saved yet."
        confirmLabel="Discard"
        onConfirm={() => {
          const action = pendingNav;
          setPendingNav(null);
          action?.();
        }}
        onCancel={() => setPendingNav(null)}
      />

      <VariantSwitcherSheet
        visible={isVariantSwitcherOpen}
        variants={variants ?? []}
        currentVariantId={variant.id}
        currency={baker?.currency}
        onDismiss={() => setIsVariantSwitcherOpen(false)}
        onSelect={(v) => {
          setIsVariantSwitcherOpen(false);
          // replace, not push — switching variants shouldn't stack a new
          // screen per variant; back should return to the product, not
          // walk through every variant you glanced at along the way.
          confirmOrRun(() => router.replace(`/products/${id}/recipe?variantId=${v.id}`));
        }}
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

function VariantSwitcherSheet({
  visible,
  variants,
  currentVariantId,
  currency,
  onDismiss,
  onSelect,
  colors,
}: {
  visible: boolean;
  variants: { id: string; name: string; selling_price: number }[];
  currentVariantId: string;
  currency: string | null | undefined;
  onDismiss: () => void;
  onSelect: (variant: { id: string; name: string; selling_price: number }) => void;
  colors: Record<ColorToken, string>;
}) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <Text style={{ ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.md }}>
        Switch variant
      </Text>
      <View>
        {variants.map((item) => {
          const isCurrent = item.id === currentVariantId;
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: spacing.sm + 2,
                paddingHorizontal: spacing.sm,
                borderRadius: radii.md,
                backgroundColor: isCurrent ? colors.surfaceMuted : 'transparent',
              }}
            >
              <Text
                style={{
                  ...typography.body,
                  color: isCurrent ? colors.primary : colors.textPrimary,
                  fontWeight: isCurrent ? '600' : '400',
                }}
              >
                {item.name}
              </Text>
              <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>
                {formatCurrency(item.selling_price, currency)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
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
          {recipes.map((item) => {
            const visual = getRecipeVisual(item.name);
            return (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  paddingVertical: spacing.sm + 2,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radii.md,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radii.sm,
                    backgroundColor: `${visual.color}1F`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ ...typography.caption, fontWeight: '700', color: visual.color }}>
                    {visual.initials}
                  </Text>
                </View>
                <View>
                  <Text style={{ ...typography.body, color: colors.textPrimary }}>{item.name}</Text>
                  <Text style={{ ...typography.caption, color: colors.textSecondary }}>
                    Yields {item.yield_quantity} {item.yield_unit}
                  </Text>
                </View>
              </Pressable>
            );
          })}
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
    subtitle: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center' },
    subtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xxs,
      marginBottom: spacing.xl,
      alignSelf: 'center',
    },
    noRecipeCard: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
      padding: spacing.xxl,
    },
    noRecipeTitle: { ...typography.titleSm, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.xs, textAlign: 'center' },
    noRecipeBody: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
    noRecipeActions: { width: '100%', gap: spacing.md },
    newRecipeLink: {
      ...typography.bodySm,
      color: colors.primary,
      fontWeight: '600',
      textAlign: 'center',
    },
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
    syncPriceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    syncPriceText: { ...typography.bodySm, color: colors.primary, fontWeight: '600', flex: 1 },
    saveButton: { marginBottom: spacing.xxxl },
  });
}
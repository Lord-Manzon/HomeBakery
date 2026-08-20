import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useAddRecipeIngredient,
  useDeleteRecipe,
  useRecipe,
  useRecipeUsage,
  useRemoveRecipeIngredient,
  useUpdateRecipe,
  useUpdateRecipeIngredient,
} from '../../../../../src/hooks/useRecipes';
import { useIngredients } from '../../../../../src/hooks/useIngredients';
import { useBakerProfile } from '../../../../../src/hooks/useBakerProfile';
import { useThemeColors } from '../../../../../src/theme/ThemeContext';
import { calculateRecipeBatchCost, calculateSuggestedPrice } from '../../../../../src/services/costing';
import { ErrorBanner } from '../../../../../src/components/ErrorBanner';
import { RecipeIngredientSheet } from '../../../../../src/components/RecipeIngredientSheet';
import { Screen } from '../../../../../src/components/Screen';
import { formatCurrency } from '../../../../../src/utils/currency';
import { recipeFormSchema } from '../../../../../src/utils/validation/recipeSchemas';
import { spacing, radii, typography } from '../../../../../src/theme';
import type { ColorToken } from '../../../../../src/theme/colors';
import type { RecipeIngredientWithDetails } from '../../../../../src/types/recipe';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: recipe, isLoading, isError, refetch } = useRecipe(id);
  const { data: usage } = useRecipeUsage(id);
  const { data: ingredients } = useIngredients();
  const { data: baker } = useBakerProfile();

  const updateRecipe = useUpdateRecipe(id);
  const deleteRecipe = useDeleteRecipe();
  const addIngredient = useAddRecipeIngredient(id);
  const updateIngredient = useUpdateRecipeIngredient(id);
  const removeIngredient = useRemoveRecipeIngredient(id);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isCostExpanded, setIsCostExpanded] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [ingredientSheet, setIngredientSheet] = useState<
    { mode: 'add' } | { mode: 'edit'; ingredient: RecipeIngredientWithDetails } | null
  >(null);

  if (isError) {
    return (
      <Screen style={styles.container}>
        <ErrorBanner message="Couldn't load this recipe." />
      </Screen>
    );
  }

  if (isLoading || !recipe) {
    return (
      <Screen style={styles.container}>
        <View style={[styles.card, styles.skeleton]} />
        <View style={[styles.card, styles.skeleton]} />
      </Screen>
    );
  }

  const batchCost = calculateRecipeBatchCost(recipe);
  const costPerUnit = recipe.yield_quantity > 0 ? batchCost / recipe.yield_quantity : 0;
  const resolvedMargin = recipe.margin_percent ?? baker?.default_margin_percent ?? null;
  const suggestedPricePerUnit =
    resolvedMargin != null ? calculateSuggestedPrice(costPerUnit, resolvedMargin) : null;

  const startEditingName = () => {
    setNameDraft(recipe.name);
    setNameError(null);
    setIsEditingName(true);
  };

  const commitNameEdit = () => {
    const trimmed = nameDraft.trim();
    setIsEditingName(false);
    if (trimmed === recipe.name) return;
    if (!trimmed) {
      setNameError("Name can't be empty");
      return;
    }
    // Only validate the name here — same reasoning as the Instructions
    // screen's fix: re-validating the whole recipe would fail on any
    // OTHER field carrying old data (e.g. a legacy yield_unit), and
    // show a name-edit error about a field that isn't the name.
    const nameResult = recipeFormSchema.shape.name.safeParse(trimmed);
    if (!nameResult.success) {
      setNameError(nameResult.error.issues[0]?.message ?? 'Something about that name is invalid.');
      return;
    }
    setNameError(null);
    updateRecipe.mutate(
      {
        name: nameResult.data,
        yield_quantity: recipe.yield_quantity,
        yield_unit: recipe.yield_unit,
        instructions: recipe.instructions,
        margin_percent: recipe.margin_percent,
      },
      { onError: () => setNameError("Couldn't save. Try again.") }
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        {isEditingName ? (
          <TextInput
            style={styles.titleInput}
            value={nameDraft}
            onChangeText={setNameDraft}
            onBlur={commitNameEdit}
            onSubmitEditing={commitNameEdit}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            maxLength={100}
          />
        ) : (
          <Pressable onPress={startEditingName} style={styles.titlePressable}>
            <Text style={styles.title} numberOfLines={1}>
              {recipe.name}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => setIsDeleteConfirming((v) => !v)}
          style={styles.iconButton}
          accessibilityLabel="Delete recipe"
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>

      {nameError ? <Text style={styles.nameErrorText}>{nameError}</Text> : null}

      {isDeleteConfirming ? (
        <View style={styles.inlineConfirmRow}>
          <Text style={styles.inlineConfirmText}>
            Delete this recipe? Any product using it keeps working, but falls back to packaging
            cost only until re-linked to a different recipe.
          </Text>
          <View style={styles.inlineConfirmActions}>
            <Pressable onPress={() => setIsDeleteConfirming(false)} style={styles.inlineConfirmCancel}>
              <Text style={styles.inlineConfirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => deleteRecipe.mutate(id, { onSuccess: () => router.back() })}
              style={styles.inlineConfirmDelete}
              disabled={deleteRecipe.isPending}
            >
              <Text style={styles.inlineConfirmDeleteText}>
                {deleteRecipe.isPending ? 'Deleting…' : 'Confirm delete'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.yieldLine}>
          Yields {recipe.yield_quantity} {recipe.yield_unit}
        </Text>

        {/* Collapsed cost summary card — per docs/UI_UX_1.md section 6:
            most days a baker just wants to glance at "am I still
            profitable," not re-derive the math. */}
        <Pressable
          style={styles.costCard}
          onPress={() => setIsCostExpanded((v) => !v)}
          accessibilityLabel="Toggle cost breakdown"
        >
          <View style={styles.costCardTopRow}>
            <View>
              <Text style={styles.costLabel}>Cost per {recipe.yield_unit}</Text>
              <Text style={styles.costValue}>
                {formatCurrency(costPerUnit, baker?.currency)}
              </Text>
            </View>
            <Ionicons
              name={isCostExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </View>

          {isCostExpanded ? (
            <View style={styles.costBreakdown}>
              <CostRow label="Ingredient cost (full batch)" value={formatCurrency(batchCost, baker?.currency)} colors={colors} />
              <CostRow
                label={`Cost per ${recipe.yield_unit}`}
                value={formatCurrency(costPerUnit, baker?.currency)}
                colors={colors}
              />
              {resolvedMargin != null ? (
                <CostRow label="Margin used" value={`${resolvedMargin}%`} colors={colors} />
              ) : null}
              {suggestedPricePerUnit != null ? (
                <CostRow
                  label={`Suggested price per ${recipe.yield_unit}`}
                  value={formatCurrency(suggestedPricePerUnit, baker?.currency)}
                  colors={colors}
                  emphasize
                />
              ) : null}
              <Text style={styles.costNote}>
                This is a per-batch reference only — a linked product variant's actual suggested
                price also factors in its own portion of the batch and packaging cost. See that
                variant's "Recipe & costing" screen for the real number.
              </Text>
            </View>
          ) : null}
        </Pressable>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Ingredients</Text>
          <Pressable onPress={() => setIngredientSheet({ mode: 'add' })} style={styles.addLink}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.addLinkText}>Add</Text>
          </Pressable>
        </View>

        {recipe.ingredients.length === 0 ? (
          <Text style={styles.emptyIngredients}>
            Add ingredients to see your cost per {recipe.yield_unit}.
          </Text>
        ) : (
          recipe.ingredients.map((ri) => (
            <Pressable
              key={ri.id}
              style={styles.ingredientRow}
              onPress={() => setIngredientSheet({ mode: 'edit', ingredient: ri })}
            >
              <Text style={styles.ingredientName}>{ri.ingredient.name}</Text>
              <Text style={styles.ingredientQty}>
                {ri.quantity} {ri.unit}
              </Text>
            </Pressable>
          ))
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Instructions</Text>
          <Pressable
            onPress={() => router.push(`/more/recipes/${id}/instructions`)}
            style={styles.addLink}
          >
            <Ionicons
              name={recipe.instructions && recipe.instructions.length > 0 ? 'create-outline' : 'add'}
              size={16}
              color={colors.primary}
            />
            <Text style={styles.addLinkText}>
              {recipe.instructions && recipe.instructions.length > 0 ? 'Edit' : 'Add'}
            </Text>
          </Pressable>
        </View>

        {!recipe.instructions || recipe.instructions.length === 0 ? (
          <Pressable onPress={() => router.push(`/more/recipes/${id}/instructions`)}>
            <Text style={styles.emptyIngredients}>
              No steps yet — add them so they're not just in your head.
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.instructionsCard}
            onPress={() => router.push(`/more/recipes/${id}/instructions`)}
          >
            {recipe.instructions.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{i + 1}.</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </Pressable>
        )}

        {usage && usage.length > 0 ? (
          <>
            <Text style={styles.sectionHeader}>Used in</Text>
            {usage.map((u) => (
              <Pressable
                key={u.variant_id}
                style={styles.usageRow}
                onPress={() => router.push(`/more/products/${u.product_id}`)}
              >
                <Text style={styles.usageText}>
                  {u.product_name} — {u.variant_name}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </Pressable>
            ))}
          </>
        ) : null}

      </ScrollView>

      <RecipeIngredientSheet
        visible={!!ingredientSheet}
        onDismiss={() => setIngredientSheet(null)}
        ingredients={ingredients ?? []}
        initialValue={
          ingredientSheet?.mode === 'edit'
            ? {
                ingredient_id: ingredientSheet.ingredient.ingredient_id,
                quantity: ingredientSheet.ingredient.quantity,
                unit: ingredientSheet.ingredient.unit,
              }
            : null
        }
        isSaving={addIngredient.isPending || updateIngredient.isPending}
        errorMessage={
          addIngredient.isError || updateIngredient.isError ? "Couldn't save. Try again." : null
        }
        onSubmit={(input) => {
          if (ingredientSheet?.mode === 'edit') {
            updateIngredient.mutate(
              { id: ingredientSheet.ingredient.id, input },
              { onSuccess: () => setIngredientSheet(null) }
            );
          } else {
            addIngredient.mutate(input, { onSuccess: () => setIngredientSheet(null) });
          }
        }}
      />
    </Screen>
  );
}

function CostRow({
  label,
  value,
  colors,
  emphasize,
}: {
  label: string;
  value: string;
  colors: Record<ColorToken, string>;
  emphasize?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
      <Text style={{ ...typography.bodySm, color: colors.textSecondary }}>{label}</Text>
      <Text
        style={{
          ...typography.bodySm,
          color: emphasize ? colors.primary : colors.textPrimary,
          fontWeight: emphasize ? '700' : '600',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: spacing.xl },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    titlePressable: { flex: 1 },
    title: { ...typography.titleLg, color: colors.textPrimary, textAlign: 'center' },
    titleInput: {
      ...typography.titleLg,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingBottom: spacing.xxs,
    },
    nameErrorText: {
      ...typography.caption,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    iconButton: { width: 44, height: 44, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center' },
    yieldLine: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
    skeleton: { height: 80, backgroundColor: colors.surfaceMuted, borderWidth: 0 },
    costCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.xl,
    },
    costCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    costLabel: { ...typography.bodySm, color: colors.textSecondary },
    costValue: { ...typography.titleLg, color: colors.textPrimary, marginTop: spacing.xxs },
    costBreakdown: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    costNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    sectionHeader: { ...typography.titleSm, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
    addLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    addLinkText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    emptyIngredients: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    ingredientRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xs,
    },
    ingredientName: { ...typography.body, color: colors.textPrimary },
    ingredientQty: { ...typography.bodySm, color: colors.textSecondary },
    usageRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    usageText: { ...typography.bodySm, color: colors.textPrimary },
    instructionsCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    stepRow: { flexDirection: 'row', marginBottom: spacing.sm },
    stepNumber: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600', width: 22 },
    stepText: { ...typography.bodySm, color: colors.textPrimary, flex: 1 },
    inlineConfirmRow: {
      backgroundColor: colors.dangerMuted,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    inlineConfirmText: { ...typography.bodySm, color: colors.danger, marginBottom: spacing.sm },
    inlineConfirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
    inlineConfirmCancel: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    inlineConfirmCancelText: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
    inlineConfirmDelete: {
      backgroundColor: colors.danger,
      borderRadius: radii.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    inlineConfirmDeleteText: { ...typography.bodySm, color: colors.textInverse, fontWeight: '600' },
  });
}

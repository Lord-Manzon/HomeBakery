import { useMemo, useRef, useState } from 'react';
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
} from '../../../../src/hooks/useRecipes';
import { useIngredients } from '../../../../src/hooks/useIngredients';
import { useBakerProfile } from '../../../../src/hooks/useBakerProfile';
import { useNavigateOnce } from '../../../../src/hooks/useNavigateOnce';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { calculateRecipeBatchCost, calculateSuggestedPrice } from '../../../../src/services/costing';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { InstructionsTimeline } from '../../../../src/components/InstructionsTimeline';
import { RecipeIngredientSheet } from '../../../../src/components/RecipeIngredientSheet';
import { Screen } from '../../../../src/components/Screen';
import { formatCurrency } from '../../../../src/utils/currency';
import { getCategoryIcon } from '../../../../src/utils/ingredientCategoryIcon';
import { getRecipeVisual } from '../../../../src/utils/recipeVisual';
import { recipeFormSchema } from '../../../../src/utils/validation/recipeSchemas';
import { spacing, radii, typography } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import type { RecipeIngredientWithDetails } from '../../../../src/types/recipe';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
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
  const [isEditingYield, setIsEditingYield] = useState(false);
  const [yieldQtyDraft, setYieldQtyDraft] = useState('');
  const [yieldUnitDraft, setYieldUnitDraft] = useState('');
  const [yieldError, setYieldError] = useState<string | null>(null);
  // Two inputs share one "commit on tap-away" behavior. Moving focus
  // from the quantity box to the unit box fires the quantity box's
  // onBlur BEFORE the unit box's onFocus — without this, that in-between
  // moment would look like "tapped away" and commit mid-edit. Delaying
  // the commit slightly and canceling it if the sibling field gets
  // focus in that window fixes it.
  const yieldBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCostExpanded, setIsCostExpanded] = useState(false);
  const [isUsageExpanded, setIsUsageExpanded] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [ingredientSheet, setIngredientSheet] = useState<
    { mode: 'add' } | { mode: 'edit'; ingredient: RecipeIngredientWithDetails } | null
  >(null);
  // Hold-to-select removal, same idea as New Product's long-press-to-wiggle
  // category chips (docs/DECISIONS.md, 2026-08-18) but for multiple rows at
  // once: long-press an ingredient row to enter selection mode (protects
  // against an accidental single mis-tap opening the wrong thing), then tap
  // more rows to build up a batch, then remove them together.
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<string>>(new Set());
  const [isRemoveConfirming, setIsRemoveConfirming] = useState(false);
  const isSelectingIngredients = selectedIngredientIds.size > 0;
  // Ingredients and Instructions used to be stacked in one long scroll —
  // split into tabs so each is its own scrollable area instead of one
  // giant page, per the on-device feedback that it read as too long.
  const [activeTab, setActiveTab] = useState<'ingredients' | 'instructions'>('ingredients');

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
  // Ingredients already on this recipe are excluded from the "add" picker
  // so a baker can't accidentally create two lines for the same
  // ingredient — see docs/DECISIONS.md.
  const usedIngredientIds = new Set(recipe.ingredients.map((ri) => ri.ingredient_id));
  const pickableIngredients = (ingredients ?? []).filter((i) => !usedIngredientIds.has(i.id));
  const visual = getRecipeVisual(recipe.name);

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
        intro: recipe.intro,
        instructions: recipe.instructions,
        margin_percent: recipe.margin_percent,
      },
      { onError: () => setNameError("Couldn't save. Try again.") }
    );
  };

  const startEditingYield = () => {
    setYieldQtyDraft(String(recipe.yield_quantity));
    setYieldUnitDraft(recipe.yield_unit);
    setYieldError(null);
    setIsEditingYield(true);
  };

  const cancelScheduledYieldCommit = () => {
    if (yieldBlurTimeout.current) {
      clearTimeout(yieldBlurTimeout.current);
      yieldBlurTimeout.current = null;
    }
  };

  const scheduleYieldCommit = () => {
    cancelScheduledYieldCommit();
    yieldBlurTimeout.current = setTimeout(commitYieldEdit, 80);
  };

  const commitYieldEdit = () => {
    cancelScheduledYieldCommit();
    const trimmedUnit = yieldUnitDraft.trim();
    setIsEditingYield(false);
    if (yieldQtyDraft.trim() === String(recipe.yield_quantity) && trimmedUnit === recipe.yield_unit) {
      return;
    }
    // Validate only the two fields this edit actually touches — same
    // reasoning as the name and instructions fixes: re-validating the
    // whole recipe would fail on any OTHER field carrying old data.
    const qtyResult = recipeFormSchema.shape.yield_quantity.safeParse(yieldQtyDraft);
    if (!qtyResult.success) {
      setYieldError(qtyResult.error.issues[0]?.message ?? 'Enter a valid quantity.');
      return;
    }
    const unitResult = recipeFormSchema.shape.yield_unit.safeParse(trimmedUnit);
    if (!unitResult.success) {
      setYieldError(unitResult.error.issues[0]?.message ?? 'Enter a valid unit.');
      return;
    }
    setYieldError(null);
    updateRecipe.mutate(
      {
        name: recipe.name,
        yield_quantity: qtyResult.data,
        yield_unit: unitResult.data,
        intro: recipe.intro,
        instructions: recipe.instructions,
        margin_percent: recipe.margin_percent,
      },
      { onError: () => setYieldError("Couldn't save. Try again.") }
    );
  };

  const toggleIngredientSelection = (id: string) => {
    setSelectedIngredientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearIngredientSelection = () => {
    setSelectedIngredientIds(new Set());
    setIsRemoveConfirming(false);
  };

  const handleIngredientRowPress = (ri: RecipeIngredientWithDetails) => {
    if (isSelectingIngredients) {
      toggleIngredientSelection(ri.id);
    } else {
      setIngredientSheet({ mode: 'edit', ingredient: ri });
    }
  };

  const confirmRemoveSelectedIngredients = async () => {
    const ids = Array.from(selectedIngredientIds);
    await Promise.all(ids.map((removeId) => removeIngredient.mutateAsync(removeId)));
    clearIngredientSelection();
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

      <View style={{ paddingBottom: spacing.sm }}>
        {isEditingYield ? (
          <View style={styles.yieldEditRow}>
            <Text style={styles.yieldEditLabel}>Yields</Text>
            <TextInput
              style={styles.yieldQtyInput}
              value={yieldQtyDraft}
              onChangeText={setYieldQtyDraft}
              onBlur={scheduleYieldCommit}
              onFocus={cancelScheduledYieldCommit}
              onSubmitEditing={commitYieldEdit}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              returnKeyType="next"
            />
            <TextInput
              style={styles.yieldUnitInput}
              value={yieldUnitDraft}
              onChangeText={setYieldUnitDraft}
              onBlur={scheduleYieldCommit}
              onFocus={cancelScheduledYieldCommit}
              onSubmitEditing={commitYieldEdit}
              returnKeyType="done"
              maxLength={30}
            />
          </View>
        ) : (
          <Pressable onPress={startEditingYield}>
            <Text style={styles.yieldLine}>
              Yields {recipe.yield_quantity} {recipe.yield_unit}
            </Text>
          </Pressable>
        )}
        {yieldError ? <Text style={styles.yieldErrorText}>{yieldError}</Text> : null}

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
              {recipe.ingredients.length > 0 ? (
                <>
                  <Text style={styles.costBreakdownSectionLabel}>Ingredients cost breakdown</Text>
                  {recipe.ingredients.map((ri) => (
                    <CostRow
                      key={ri.id}
                      label={`${ri.ingredient.name} (${ri.quantity} ${ri.unit})`}
                      value={formatCurrency(ri.quantity * ri.ingredient.cost_per_unit, baker?.currency)}
                      colors={colors}
                    />
                  ))}
                  <View style={styles.costBreakdownDivider} />
                </>
              ) : null}
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

        {usage && usage.length > 0 ? (
          <>
            <Pressable
              style={styles.sectionHeaderRow}
              onPress={() => setIsUsageExpanded((v) => !v)}
              accessibilityLabel="Toggle used-in list"
            >
              <Text style={styles.sectionHeader}>
                Used in {usage.length} product{usage.length === 1 ? '' : 's'}
              </Text>
              <Ionicons
                name={isUsageExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>

            {isUsageExpanded
              ? usage.map((u) => (
                  <Pressable
                    key={u.variant_id}
                    style={styles.usageRow}
                    onPress={() => navigateOnce(`/products/${u.product_id}`)}
                  >
                    <Text style={styles.usageText}>
                      {u.product_name} — {u.variant_name}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>
                ))
              : null}
          </>
        ) : null}
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabButton, activeTab === 'ingredients' && styles.tabButtonActive]}
          onPress={() => setActiveTab('ingredients')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'ingredients' && styles.tabButtonTextActive]}>
            Ingredients
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === 'instructions' && styles.tabButtonActive]}
          onPress={() => setActiveTab('instructions')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'instructions' && styles.tabButtonTextActive]}>
            Instructions
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.tabContent}
        showsVerticalScrollIndicator={false}
        // Ingredients can run long and needs to scroll; Instructions is
        // capped to a fixed-height clipped preview ("View all N steps"
        // takes you to the full screen for anything longer), so there's
        // nothing on this tab that ever needs scrolling — locking it
        // avoids the odd feeling of "swipe over static content and the
        // page nudges by a few px" for a short recipe.
        scrollEnabled={activeTab !== 'instructions'}
        contentContainerStyle={{ paddingBottom: spacing.xxxl + 96 }}
      >
        {activeTab === 'ingredients' ? (
          <>
            <View style={styles.sectionHeaderRow}>
              {isSelectingIngredients ? (
                <>
                  <Pressable onPress={clearIngredientSelection} style={styles.addLink}>
                    <Text style={styles.addLinkText}>Cancel</Text>
                  </Pressable>
                  <Text style={styles.sectionHeader}>{selectedIngredientIds.size} selected</Text>
                  <Pressable
                    onPress={() => setIsRemoveConfirming(true)}
                    style={styles.iconButton}
                    accessibilityLabel="Remove selected ingredients"
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.sectionHeader}>Ingredients</Text>
                  <Pressable onPress={() => setIngredientSheet({ mode: 'add' })} style={styles.addLink}>
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={styles.addLinkText}>Add</Text>
                  </Pressable>
                </>
              )}
            </View>

            {isRemoveConfirming ? (
              <View style={styles.inlineConfirmRow}>
                <Text style={styles.inlineConfirmText}>
                  Remove {selectedIngredientIds.size} ingredient
                  {selectedIngredientIds.size === 1 ? '' : 's'} from this recipe?
                </Text>
                <View style={styles.inlineConfirmActions}>
                  <Pressable onPress={() => setIsRemoveConfirming(false)} style={styles.inlineConfirmCancel}>
                    <Text style={styles.inlineConfirmCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={confirmRemoveSelectedIngredients}
                    style={styles.inlineConfirmDelete}
                    disabled={removeIngredient.isPending}
                  >
                    <Text style={styles.inlineConfirmDeleteText}>
                      {removeIngredient.isPending ? 'Removing…' : 'Confirm remove'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {recipe.ingredients.length === 0 ? (
              <Text style={styles.emptyIngredients}>
                Add ingredients to see your cost per {recipe.yield_unit}.
              </Text>
            ) : (
              recipe.ingredients.map((ri) => {
                const isSelected = selectedIngredientIds.has(ri.id);
                return (
                  <Pressable
                    key={ri.id}
                    style={[styles.ingredientRow, isSelected && styles.ingredientRowSelected]}
                    onPress={() => handleIngredientRowPress(ri)}
                    onLongPress={() => toggleIngredientSelection(ri.id)}
                  >
                    <View style={styles.ingredientRowLeft}>
                      <View style={styles.ingredientIconTile}>
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : getCategoryIcon(ri.ingredient.category)}
                          size={16}
                          color={isSelected ? colors.primary : colors.textSecondary}
                        />
                      </View>
                      <Text style={styles.ingredientName}>{ri.ingredient.name}</Text>
                    </View>
                    <Text style={styles.ingredientQty}>
                      {ri.quantity} {ri.unit}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>Instructions</Text>
              <Pressable
                onPress={() => navigateOnce(`/recipes/${id}/instructions`)}
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

            {recipe.intro ? <Text style={styles.recipeIntroPreview}>{recipe.intro}</Text> : null}

            {!recipe.instructions || recipe.instructions.length === 0 ? (
              <Pressable onPress={() => navigateOnce(`/recipes/${id}/instructions`)}>
                <Text style={styles.emptyIngredients}>
                  No steps yet — add them so they're not just in your head.
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => navigateOnce(`/recipes/${id}/instructions`)}
                style={styles.instructionsPreviewWrap}
              >
                {/* Fixed-height clipped preview, not its own scroll area — a
                    long recipe used to grow this timeline to full height
                    inside the tab's outer ScrollView, which is what was
                    getting visually cut off by the bottom nav. Clipping to
                    a couple of steps and sending the rest to the full
                    screen (below) fixes that and matches "tap to see it
                    properly" rather than fighting for scroll space here. */}
                <View style={styles.instructionsPreviewClip} pointerEvents="none">
                  <InstructionsTimeline
                    steps={recipe.instructions.slice(0, 5)}
                    accentColor={visual.color}
                    colors={colors}
                  />
                </View>
                <View style={styles.instructionsViewAllRow}>
                  <Text style={styles.instructionsViewAllText}>
                    {recipe.instructions.length > 5
                      ? `View all ${recipe.instructions.length} steps`
                      : 'View full instructions'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </View>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      <RecipeIngredientSheet
        visible={!!ingredientSheet}
        onDismiss={() => setIngredientSheet(null)}
        ingredients={pickableIngredients}
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
    yieldEditRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.lg },
    yieldEditLabel: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.xxs + 2 },
    yieldQtyInput: {
      ...typography.bodySm,
      color: colors.textPrimary,
      width: 48,
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingBottom: spacing.xxs,
    },
    yieldUnitInput: {
      ...typography.bodySm,
      color: colors.textPrimary,
      flex: 1,
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingBottom: spacing.xxs,
    },
    yieldErrorText: { ...typography.caption, color: colors.danger, marginTop: -spacing.md, marginBottom: spacing.lg },
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
    costBreakdownSectionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
    },
    costBreakdownDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
    costNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      padding: spacing.xxs,
      marginBottom: spacing.md,
    },
    tabButton: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radii.sm },
    tabButtonActive: { backgroundColor: colors.primary },
    tabButtonText: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
    tabButtonTextActive: { color: colors.textInverse },
    tabContent: { flex: 1 },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    sectionHeader: { ...typography.titleSm, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
    addLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    addLinkText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    emptyIngredients: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    instructionsPreviewWrap: { marginBottom: spacing.xl },
    recipeIntroPreview: {
      ...typography.bodySm,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginBottom: spacing.md,
    },
    instructionsPreviewClip: { maxHeight: 460, overflow: 'hidden' },
    instructionsViewAllRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xxs,
      paddingTop: spacing.sm,
      marginTop: spacing.xxs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    instructionsViewAllText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
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
    ingredientRowSelected: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.primary,
    },
    ingredientRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
    ingredientIconTile: {
      width: 28,
      height: 28,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
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
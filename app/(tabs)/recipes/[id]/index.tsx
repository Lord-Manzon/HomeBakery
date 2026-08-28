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
import { RecipeIngredientSheet } from '../../../../src/components/RecipeIngredientSheet';
import { Screen } from '../../../../src/components/Screen';
import { formatCurrency } from '../../../../src/utils/currency';
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

  const { data: recipe, isLoading, isError } = useRecipe(id);
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
  // Total time: a single field, so no sibling-focus race like yield's
  // two inputs — a plain onBlur commit is enough.
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [timeDraft, setTimeDraft] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
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

  // Total time: recipe.total_time_minutes is a manual override (see
  // migration 0013) that, once set, always wins. Until a baker sets
  // one, this falls back to summing whatever duration_minutes each
  // step happens to have -- and if NO step has a duration set either,
  // there's nothing honest to show, so the whole row stays hidden
  // rather than displaying a fabricated "0 min".
  const stepsWithDuration = (recipe.instructions ?? []).filter((s) => s.duration_minutes != null);
  const computedTimeFromSteps =
    stepsWithDuration.length > 0
      ? stepsWithDuration.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0)
      : null;
  const effectiveTimeMinutes = recipe.total_time_minutes ?? computedTimeFromSteps;

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
        total_time_minutes: recipe.total_time_minutes,
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
        total_time_minutes: recipe.total_time_minutes,
        margin_percent: recipe.margin_percent,
      },
      { onError: () => setYieldError("Couldn't save. Try again.") }
    );
  };

  const startEditingTime = () => {
    setTimeDraft(effectiveTimeMinutes != null ? String(effectiveTimeMinutes) : '');
    setTimeError(null);
    setIsEditingTime(true);
  };

  const commitTimeEdit = () => {
    setIsEditingTime(false);
    const trimmed = timeDraft.trim();
    const currentDisplay = effectiveTimeMinutes != null ? String(effectiveTimeMinutes) : '';
    if (trimmed === currentDisplay) return;
    // Empty input means "clear the override, go back to auto-calculated
    // from steps" -- schema's preprocess turns '' into null for us.
    const timeResult = recipeFormSchema.shape.total_time_minutes.safeParse(trimmed);
    if (!timeResult.success) {
      setTimeError(timeResult.error.issues[0]?.message ?? 'Enter a valid number of minutes.');
      return;
    }
    setTimeError(null);
    updateRecipe.mutate(
      {
        name: recipe.name,
        yield_quantity: recipe.yield_quantity,
        yield_unit: recipe.yield_unit,
        intro: recipe.intro,
        instructions: recipe.instructions,
        total_time_minutes: timeResult.data,
        margin_percent: recipe.margin_percent,
      },
      { onError: () => setTimeError("Couldn't save. Try again.") }
    );
  };

  const toggleIngredientSelection = (ingredientRowId: string) => {
    setSelectedIngredientIds((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientRowId)) next.delete(ingredientRowId);
      else next.add(ingredientRowId);
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Card 1: yield, time, cost (expandable), used-in (expandable) —
            all one card now, rather than a separate cost card plus a
            loose "used in" section floating below it. */}
        <View style={styles.overviewCard}>
          {isEditingYield ? (
            <View style={styles.yieldEditRow}>
              <Text style={styles.overviewLabel}>Yield</Text>
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
            <Pressable style={styles.overviewRow} onPress={startEditingYield}>
              <Text style={styles.overviewLabel}>Yield</Text>
              <Text style={styles.overviewValue}>
                {recipe.yield_quantity} {recipe.yield_unit}
              </Text>
            </Pressable>
          )}
          {yieldError ? <Text style={styles.overviewErrorText}>{yieldError}</Text> : null}

          {isEditingTime ? (
            <View style={styles.yieldEditRow}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <TextInput
                style={styles.timeInput}
                value={timeDraft}
                onChangeText={setTimeDraft}
                onBlur={commitTimeEdit}
                onSubmitEditing={commitTimeEdit}
                keyboardType="number-pad"
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                placeholder="min"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          ) : effectiveTimeMinutes != null ? (
            <Pressable style={styles.overviewRow} onPress={startEditingTime}>
              <View style={styles.overviewLabelWithIcon}>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              </View>
              <Text style={styles.overviewValue}>{effectiveTimeMinutes} min</Text>
            </Pressable>
          ) : (
            // No step has a duration set and there's no manual override
            // yet — still tappable, so a baker can set a total time by
            // hand even before any step has one, per the "even after
            // it's calculated, user should still be able to edit it"
            // requirement extending to "there's nothing to calculate
            // yet either."
            <Pressable style={styles.overviewRow} onPress={startEditingTime}>
              <View style={styles.overviewLabelWithIcon}>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              </View>
              <Text style={styles.overviewValueMuted}>Add time</Text>
            </Pressable>
          )}
          {timeError ? <Text style={styles.overviewErrorText}>{timeError}</Text> : null}

          <View style={styles.overviewDivider} />

          <Pressable
            style={styles.costSection}
            onPress={() => setIsCostExpanded((v) => !v)}
            accessibilityLabel="Toggle cost breakdown"
          >
            <View style={styles.overviewRow}>
              <View>
                <Text style={styles.overviewLabel}>Cost per {recipe.yield_unit}</Text>
                <Text style={styles.costValue}>{formatCurrency(costPerUnit, baker?.currency)}</Text>
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
                <CostRow
                  label="Ingredient cost (full batch)"
                  value={formatCurrency(batchCost, baker?.currency)}
                  colors={colors}
                />
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
              <View style={styles.overviewDivider} />
              <Pressable
                style={styles.usageSection}
                onPress={() => setIsUsageExpanded((v) => !v)}
                accessibilityLabel="Toggle used-in list"
              >
                <View style={styles.overviewRow}>
                  <Text style={styles.overviewLabel}>
                    Used in {usage.length} product{usage.length === 1 ? '' : 's'}
                  </Text>
                  <Ionicons
                    name={isUsageExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </View>
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

        {/* Card 2: Ingredients / Instructions, both flat lists rendered
            directly in this card — no per-item borders/cards, no icons
            on ingredient rows, and instructions show in full here (no
            clipped preview, no separate screen just to look at them).
            "Edit" still opens the real editor for actual changes —
            reordering, splitting/merging steps, the intro field. */}
        <View style={styles.tabsCard}>
          <View style={styles.tabBarUnderline}>
            <Pressable onPress={() => setActiveTab('ingredients')} style={styles.tabUnderlineButton}>
              <Text
                style={[
                  styles.tabUnderlineText,
                  activeTab === 'ingredients' && styles.tabUnderlineTextActive,
                ]}
              >
                Ingredients
              </Text>
              {activeTab === 'ingredients' ? <View style={styles.tabUnderlineIndicator} /> : null}
            </Pressable>
            <Pressable onPress={() => setActiveTab('instructions')} style={styles.tabUnderlineButton}>
              <Text
                style={[
                  styles.tabUnderlineText,
                  activeTab === 'instructions' && styles.tabUnderlineTextActive,
                ]}
              >
                Instructions
              </Text>
              {activeTab === 'instructions' ? <View style={styles.tabUnderlineIndicator} /> : null}
            </Pressable>
          </View>

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
                <Text style={styles.emptyState}>Add ingredients to see your cost per {recipe.yield_unit}.</Text>
              ) : (
                recipe.ingredients.map((ri, idx) => {
                  const isSelected = selectedIngredientIds.has(ri.id);
                  const isLast = idx === recipe.ingredients.length - 1;
                  return (
                    <Pressable
                      key={ri.id}
                      style={[
                        styles.flatRow,
                        isLast && styles.flatRowLast,
                        isSelected && styles.flatRowSelected,
                      ]}
                      onPress={() => handleIngredientRowPress(ri)}
                      onLongPress={() => toggleIngredientSelection(ri.id)}
                    >
                      <Text style={styles.flatRowText}>{ri.ingredient.name}</Text>
                      <Text style={styles.flatRowValue}>
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
                <Pressable onPress={() => navigateOnce(`/recipes/${id}/instructions`)} style={styles.addLink}>
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
                  <Text style={styles.emptyState}>No steps yet — add them so they're not just in your head.</Text>
                </Pressable>
              ) : (
                recipe.instructions.map((step, idx) => {
                  const isLast = idx === (recipe.instructions?.length ?? 0) - 1;
                  return (
                    <View key={idx} style={[styles.stepFlatRow, isLast && styles.flatRowLast]}>
                      <View style={styles.stepFlatDot}>
                        <Text style={styles.stepFlatDotText}>{idx + 1}</Text>
                      </View>
                      <Text style={styles.stepFlatText}>{step.text}</Text>
                    </View>
                  );
                })
              )}
            </>
          )}
        </View>
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
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
    skeleton: { height: 80, backgroundColor: colors.surfaceMuted, borderWidth: 0 },

    scrollContent: { paddingBottom: spacing.xxxl + 96 },

    // Card 1: overview (yield, time, cost, used-in) -- one shared card
    // instead of a separate cost card plus a loose section below it.
    overviewCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.xl,
    },
    overviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    overviewLabel: { ...typography.bodySm, color: colors.textSecondary },
    overviewLabelWithIcon: { flexDirection: 'row', alignItems: 'center' },
    overviewValue: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    overviewValueMuted: { ...typography.bodySm, color: colors.textSecondary, fontStyle: 'italic' },
    overviewErrorText: { ...typography.caption, color: colors.danger, marginTop: spacing.xxs },
    overviewDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
    yieldEditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    yieldQtyInput: {
      ...typography.body,
      color: colors.textPrimary,
      width: 48,
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingBottom: spacing.xxs,
    },
    yieldUnitInput: {
      ...typography.body,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'right',
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingBottom: spacing.xxs,
    },
    timeInput: {
      ...typography.body,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'right',
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingBottom: spacing.xxs,
    },

    costSection: {},
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

    usageSection: {},
    usageRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    usageText: { ...typography.bodySm, color: colors.textPrimary },

    // Card 2: Ingredients / Instructions
    tabsCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.xl,
    },
    tabBarUnderline: {
      flexDirection: 'row',
      gap: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: spacing.md,
    },
    tabUnderlineButton: { paddingBottom: spacing.sm },
    tabUnderlineText: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
    tabUnderlineTextActive: { color: colors.primary },
    tabUnderlineIndicator: {
      position: 'absolute',
      bottom: -1,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: colors.primary,
    },

    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    sectionHeader: { ...typography.titleSm, color: colors.textPrimary },
    addLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    addLinkText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    emptyState: { ...typography.bodySm, color: colors.textSecondary, paddingVertical: spacing.sm },
    recipeIntroPreview: {
      ...typography.bodySm,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginBottom: spacing.md,
    },

    // Flat rows -- no per-item card/border, no icon slot. A thin
    // bottom-border divider between rows is the only separation, per
    // "flat lists, not individual cards."
    flatRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    flatRowLast: { borderBottomWidth: 0 },
    flatRowSelected: { backgroundColor: colors.surfaceMuted },
    flatRowText: { ...typography.body, color: colors.textPrimary },
    flatRowValue: { ...typography.bodySm, color: colors.textSecondary },

    stepFlatRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    stepFlatDot: {
      width: 22,
      height: 22,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    stepFlatDotText: { ...typography.caption, color: colors.textInverse, fontWeight: '700' },
    stepFlatText: { ...typography.body, color: colors.textPrimary, flex: 1 },

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

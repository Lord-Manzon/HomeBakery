import { useHideFloatingNav } from '../../../../../src/hooks/useHideFloatingNav';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRecipe, useUpdateRecipe } from '../../../../../src/hooks/useRecipes';
import { useThemeColors } from '../../../../../src/theme/ThemeContext';
import { ConfirmDialog } from '../../../../../src/components/ConfirmDialog';
import { ErrorBanner } from '../../../../../src/components/ErrorBanner';
import { Screen } from '../../../../../src/components/Screen';
import { getRecipeVisual } from '../../../../../src/utils/recipeVisual';
import { recipeFormSchema } from '../../../../../src/utils/validation/recipeSchemas';
import { spacing, radii, typography } from '../../../../../src/theme';
import type { ColorToken } from '../../../../../src/theme/colors';

type FormatMode = 'steps' | 'block';
// View: a read-only timeline, the default way to land on this screen
// when steps already exist — matches "tap an instruction to view it."
// Edit: the existing steps/block editor, entered via the pencil icon.
type ScreenMode = 'view' | 'edit';

export default function RecipeInstructionsScreen() {
  useHideFloatingNav();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: recipe, isLoading, isError } = useRecipe(id);
  const updateRecipe = useUpdateRecipe(id);

  // Steps and block text are both kept in state at once (not derived from
  // one another on every render) so toggling back and forth doesn't lose
  // anything the baker typed in the mode they're not currently viewing.
  const [formatMode, setFormatMode] = useState<FormatMode>('steps');
  const [screenMode, setScreenMode] = useState<ScreenMode>('view');
  const [steps, setSteps] = useState<string[]>(['']);
  const [blockText, setBlockText] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  // Seed local state once the recipe loads. Existing multi-step data
  // opens in Steps format; a single legacy block (or no instructions
  // yet) opens in One block format — see docs/DECISIONS.md's 2026-08-21
  // entry. A recipe with no steps yet has nothing to view, so it skips
  // straight to edit mode instead of showing an empty timeline that
  // needs an extra tap to do anything with.
  useEffect(() => {
    if (!recipe || initialized) return;
    const existing = recipe.instructions ?? [];
    const hasContent = existing.some((s) => s.trim().length > 0);
    if (existing.length > 1) {
      setFormatMode('steps');
      setSteps(existing);
      setBlockText(existing.join('\n'));
    } else {
      setFormatMode('block');
      setBlockText(existing[0] ?? '');
      setSteps(existing.length === 1 ? existing : ['']);
    }
    setScreenMode(hasContent ? 'view' : 'edit');
    setInitialized(true);
  }, [recipe, initialized]);

  if (isError) {
    return (
      <Screen style={styles.container}>
        <ErrorBanner message="Couldn't load this recipe." />
      </Screen>
    );
  }

  if (isLoading || !recipe || !initialized) {
    return (
      <Screen style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  const visual = getRecipeVisual(recipe.name);

  // The steps actually being displayed right now, regardless of which
  // format they were entered in — used both for the view-mode timeline
  // and to detect unsaved edits, so there's one source of truth for
  // "what would be saved if I hit Save right now."
  const currentInstructions =
    formatMode === 'steps'
      ? steps.map((s) => s.trim()).filter(Boolean)
      : blockText.trim()
        ? [blockText.trim()]
        : [];
  const savedInstructions = recipe.instructions ?? [];
  const isDirty =
    screenMode === 'edit' && JSON.stringify(currentInstructions) !== JSON.stringify(savedInstructions);

  const switchFormat = (next: FormatMode) => {
    if (next === formatMode) return;
    if (next === 'block') {
      // Steps -> Block: join whatever's been typed so far into one
      // paragraph, one step per line.
      setBlockText(steps.map((s) => s.trim()).filter(Boolean).join('\n'));
    } else {
      // Block -> Steps: split on line breaks, each non-empty line
      // becomes its own step row.
      const split = blockText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      setSteps(split.length > 0 ? split : ['']);
    }
    setFormatMode(next);
  };

  const updateStep = (index: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  };

  const removeStep = (index: number) => {
    setSteps((prev) => (prev.length === 1 ? [''] : prev.filter((_, i) => i !== index)));
  };

  const addStep = () => {
    setSteps((prev) => [...prev, '']);
  };

  // Reorder without a drag-and-drop dependency — up/down arrows swap a
  // step with its neighbor. Simple, no new library to vet for
  // Android/New Architecture compatibility (see docs/CODING_STANDARDS.md
  // on adding dependencies).
  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleBack = () => {
    if (isDirty) {
      setPendingNav(() => () => router.back());
    } else {
      router.back();
    }
  };

  const handleSave = () => {
    // Only validate the field this screen actually edits (instructions).
    // Re-validating the whole recipe here would fail on any OTHER field
    // that has old data predating a validation rule (e.g. a legacy
    // yield_unit saved before that check existed) — and show this
    // screen an error about a field the baker never touched. The rest
    // of the payload is passed through as-is, since updateRecipe always
    // expects the full recipe shape (see docs/DECISIONS.md's 2026-08-18
    // "Product name is editable inline" entry for the same "always
    // resend everything" constraint).
    const instructionsResult = recipeFormSchema.shape.instructions.safeParse(currentInstructions);

    if (!instructionsResult.success) {
      setSaveError(instructionsResult.error.issues[0]?.message ?? "Couldn't save. Try again.");
      return;
    }
    setSaveError(null);
    updateRecipe.mutate(
      {
        name: recipe.name,
        yield_quantity: recipe.yield_quantity,
        yield_unit: recipe.yield_unit,
        margin_percent: recipe.margin_percent,
        instructions: instructionsResult.data,
      },
      {
        // Back to the timeline view, staying on this screen — matches
        // the view <-> edit toggle rather than leaving on every save.
        onSuccess: () => setScreenMode('view'),
        onError: () => setSaveError("Couldn't save. Try again."),
      }
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={handleBack} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Instructions</Text>
        {screenMode === 'view' ? (
          <Pressable
            onPress={() => setScreenMode('edit')}
            style={styles.iconButton}
            accessibilityLabel="Edit instructions"
          >
            <Ionicons name="pencil" size={18} color={colors.primary} />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSave}
            style={styles.saveHeaderButton}
            disabled={updateRecipe.isPending}
            accessibilityLabel="Save instructions"
          >
            {updateRecipe.isPending ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.saveHeaderButtonText}>Save</Text>
            )}
          </Pressable>
        )}
      </View>

      {screenMode === 'view' ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {currentInstructions.map((step, index) => {
            const isLast = index === currentInstructions.length - 1;
            return (
              <View key={index} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, { backgroundColor: visual.color }]}>
                    <Text style={styles.timelineDotText}>{index + 1}</Text>
                  </View>
                  {!isLast ? (
                    <View style={[styles.timelineLine, { backgroundColor: `${visual.color}33` }]} />
                  ) : null}
                </View>
                <View style={styles.timelineCard}>
                  <Text style={styles.timelineStepText}>{step}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <>
          <View style={styles.modeToggle}>
            <Pressable
              style={[styles.modeButton, formatMode === 'steps' && styles.modeButtonActive]}
              onPress={() => switchFormat('steps')}
            >
              <Text style={[styles.modeButtonText, formatMode === 'steps' && styles.modeButtonTextActive]}>
                Steps
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, formatMode === 'block' && styles.modeButtonActive]}
              onPress={() => switchFormat('block')}
            >
              <Text style={[styles.modeButtonText, formatMode === 'block' && styles.modeButtonTextActive]}>
                One block
              </Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {formatMode === 'steps' ? (
              <>
                {steps.map((step, index) => (
                  <View key={index} style={styles.stepRow}>
                    <View style={styles.reorderColumn}>
                      <Pressable
                        onPress={() => moveStep(index, -1)}
                        disabled={index === 0}
                        style={styles.reorderButton}
                        accessibilityLabel="Move step up"
                      >
                        <Ionicons
                          name="chevron-up"
                          size={16}
                          color={index === 0 ? colors.border : colors.textSecondary}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => moveStep(index, 1)}
                        disabled={index === steps.length - 1}
                        style={styles.reorderButton}
                        accessibilityLabel="Move step down"
                      >
                        <Ionicons
                          name="chevron-down"
                          size={16}
                          color={index === steps.length - 1 ? colors.border : colors.textSecondary}
                        />
                      </Pressable>
                    </View>
                    <Text style={styles.stepNumber}>{index + 1}.</Text>
                    <TextInput
                      style={styles.stepInput}
                      value={step}
                      onChangeText={(v) => updateStep(index, v)}
                      placeholder={`e.g. ${index === 0 ? 'Preheat oven to 350\u00b0F' : 'Next step\u2026'}`}
                      placeholderTextColor={colors.textSecondary}
                      multiline
                    />
                    <Pressable
                      onPress={() => removeStep(index)}
                      style={styles.removeStepButton}
                      accessibilityLabel="Remove step"
                    >
                      <Ionicons name="close" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={addStep} style={styles.addStepButton}>
                  <Ionicons name="add" size={18} color={colors.primary} />
                  <Text style={styles.addStepText}>Add step</Text>
                </Pressable>
              </>
            ) : (
              <TextInput
                style={styles.blockInput}
                value={blockText}
                onChangeText={setBlockText}
                placeholder="Write out the full recipe \u2014 oven temp, method, timing, notes..."
                placeholderTextColor={colors.textSecondary}
                multiline
                textAlignVertical="top"
              />
            )}

            {saveError ? <ErrorBanner message={saveError} /> : null}
          </ScrollView>
        </>
      )}

      <ConfirmDialog
        visible={pendingNav != null}
        title="Discard changes?"
        message="Your instruction edits haven't been saved yet."
        confirmLabel="Discard"
        onConfirm={() => {
          const action = pendingNav;
          setPendingNav(null);
          action?.();
        }}
        onCancel={() => setPendingNav(null)}
      />
    </Screen>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: spacing.xl },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: { ...typography.titleLg, color: colors.textPrimary },
    iconButton: { width: 44, height: 44, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center' },
    saveHeaderButton: {
      minWidth: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    saveHeaderButtonText: { ...typography.body, color: colors.primary, fontWeight: '700' },

    // View mode — timeline
    timelineRow: { flexDirection: 'row' },
    timelineRail: { width: 28, alignItems: 'center' },
    timelineDot: {
      width: 24,
      height: 24,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timelineDotText: { ...typography.caption, color: colors.textInverse, fontWeight: '700' },
    timelineLine: { flex: 1, width: 2, marginVertical: spacing.xxs },
    timelineCard: {
      flex: 1,
      marginLeft: spacing.sm,
      marginBottom: spacing.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    timelineStepText: { ...typography.body, color: colors.textPrimary },

    // Edit mode
    modeToggle: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      padding: spacing.xxs,
      marginBottom: spacing.lg,
    },
    modeButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderRadius: radii.sm,
    },
    modeButtonActive: { backgroundColor: colors.surface },
    modeButtonText: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
    modeButtonTextActive: { color: colors.textPrimary },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.xxs },
    reorderColumn: { justifyContent: 'center', marginTop: spacing.xxs },
    reorderButton: { width: 24, height: 22, alignItems: 'center', justifyContent: 'center' },
    stepNumber: { ...typography.body, color: colors.textSecondary, fontWeight: '600', width: 20, marginTop: spacing.sm + 2 },
    stepInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      minHeight: 44,
    },
    removeStepButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
    addStepButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.sm, marginBottom: spacing.xxxl },
    addStepText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    blockInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      minHeight: 240,
      marginBottom: spacing.xxxl,
    },
  });
}
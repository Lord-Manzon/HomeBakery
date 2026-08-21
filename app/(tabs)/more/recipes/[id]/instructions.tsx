import { useHideFloatingNav } from '../../../../../src/hooks/useHideFloatingNav';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRecipe, useUpdateRecipe } from '../../../../../src/hooks/useRecipes';
import { useThemeColors } from '../../../../../src/theme/ThemeContext';
import { ErrorBanner } from '../../../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../../../src/components/PrimaryButton';
import { Screen } from '../../../../../src/components/Screen';
import { recipeFormSchema } from '../../../../../src/utils/validation/recipeSchemas';
import { spacing, radii, typography } from '../../../../../src/theme';
import type { ColorToken } from '../../../../../src/theme/colors';

type Mode = 'steps' | 'block';

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
  const [mode, setMode] = useState<Mode>('steps');
  const [steps, setSteps] = useState<string[]>(['']);
  const [blockText, setBlockText] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed local state once the recipe loads. Existing multi-step data
  // opens in Steps mode; a single legacy block (or no instructions yet)
  // opens in One block mode — see docs/DECISIONS.md's 2026-08-21 entry.
  useEffect(() => {
    if (!recipe || initialized) return;
    const existing = recipe.instructions ?? [];
    if (existing.length > 1) {
      setMode('steps');
      setSteps(existing);
      setBlockText(existing.join('\n'));
    } else {
      setMode('block');
      setBlockText(existing[0] ?? '');
      setSteps(existing.length === 1 ? existing : ['']);
    }
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

  const switchMode = (next: Mode) => {
    if (next === mode) return;
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
    setMode(next);
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

  const handleSave = () => {
    const finalInstructions =
      mode === 'steps'
        ? steps.map((s) => s.trim()).filter(Boolean)
        : blockText.trim()
          ? [blockText.trim()]
          : [];

    // Only validate the field this screen actually edits (instructions).
    // Re-validating the whole recipe here would fail on any OTHER field
    // that has old data predating a validation rule (e.g. a legacy
    // yield_unit saved before that check existed) — and show this
    // screen an error about a field the baker never touched. The rest
    // of the payload is passed through as-is, since updateRecipe always
    // expects the full recipe shape (see docs/DECISIONS.md's 2026-08-18
    // "Product name is editable inline" entry for the same "always
    // resend everything" constraint).
    const instructionsResult = recipeFormSchema.shape.instructions.safeParse(finalInstructions);

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
        onSuccess: () => router.back(),
        onError: () => setSaveError("Couldn't save. Try again."),
      }
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Instructions</Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.modeToggle}>
        <Pressable
          style={[styles.modeButton, mode === 'steps' && styles.modeButtonActive]}
          onPress={() => switchMode('steps')}
        >
          <Text style={[styles.modeButtonText, mode === 'steps' && styles.modeButtonTextActive]}>
            Steps
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, mode === 'block' && styles.modeButtonActive]}
          onPress={() => switchMode('block')}
        >
          <Text style={[styles.modeButtonText, mode === 'block' && styles.modeButtonTextActive]}>
            One block
          </Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {mode === 'steps' ? (
          <>
            {steps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
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

        <View style={styles.saveButton}>
          <PrimaryButton title="Save instructions" onPress={handleSave} isLoading={updateRecipe.isPending} />
        </View>
      </ScrollView>
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
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.sm },
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
    addStepButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.sm, marginBottom: spacing.lg },
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
      marginBottom: spacing.lg,
    },
    saveButton: { marginTop: spacing.md, marginBottom: spacing.xxxl },
  });
}
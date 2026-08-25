import { useHideFloatingNav } from '../../../../../src/hooks/useHideFloatingNav';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRecipe, useUpdateRecipe } from '../../../../../src/hooks/useRecipes';
import { useThemeColors } from '../../../../../src/theme/ThemeContext';
import { ConfirmDialog } from '../../../../../src/components/ConfirmDialog';
import { ErrorBanner } from '../../../../../src/components/ErrorBanner';
import { InstructionsTimeline } from '../../../../../src/components/InstructionsTimeline';
import { Screen } from '../../../../../src/components/Screen';
import { getRecipeVisual } from '../../../../../src/utils/recipeVisual';
import { recipeFormSchema } from '../../../../../src/utils/validation/recipeSchemas';
import { spacing, radii, typography } from '../../../../../src/theme';
import type { ColorToken } from '../../../../../src/theme/colors';
import type { RecipeStep } from '../../../../../src/types/recipe';

type FormatMode = 'steps' | 'block';
// View: a read-only timeline, the default way to land on this screen
// when steps already exist — matches "tap an instruction to view it."
// Edit: the existing steps/block editor, entered via the pencil icon.
type ScreenMode = 'view' | 'edit';

// Steps carry a stable id separate from their position in the list. A
// drag gesture needs to keep following the SAME step's text as it moves
// — keying rows by array index would swap which text a mid-drag gesture
// is holding onto the instant a reorder happens, since index-as-key
// makes React reuse the row for whatever now sits in that slot.
//
// durationMinutes/temperatureCelsius are kept as raw text (not number)
// while editing, same as every other numeric draft field in this app
// (see the yield-quantity editor above this file's sibling screen) —
// lets a baker type "1" then "2" to reach "12" without the field
// fighting a half-typed value, and an empty string cleanly means "not
// set" without needing a separate boolean.
type StepItem = { id: string; text: string; durationMinutes: string; temperatureCelsius: string };

let stepIdCounter = 0;
function makeStepId(): string {
  stepIdCounter += 1;
  return `step-${Date.now()}-${stepIdCounter}`;
}

function emptyStepItem(): StepItem {
  return { id: makeStepId(), text: '', durationMinutes: '', temperatureCelsius: '' };
}

function stepFromRecipeStep(step: RecipeStep): StepItem {
  return {
    id: makeStepId(),
    text: step.text,
    durationMinutes: step.duration_minutes != null ? String(step.duration_minutes) : '',
    temperatureCelsius: step.temperature_celsius != null ? String(step.temperature_celsius) : '',
  };
}

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
  // anything the baker typed in the format they're not currently viewing.
  const [formatMode, setFormatMode] = useState<FormatMode>('steps');
  const [screenMode, setScreenMode] = useState<ScreenMode>('view');
  const [stepItems, setStepItems] = useState<StepItem[]>([emptyStepItem()]);
  const [blockText, setBlockText] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  // Disabled while a row is actively being dragged, so a drag near the
  // top/bottom of the visible list doesn't also try to scroll the page.
  const [isReordering, setIsReordering] = useState(false);

  // Seed local state once the recipe loads. Existing multi-step data
  // opens in Steps format; a single legacy block (or no instructions
  // yet) opens in One block format — see docs/DECISIONS.md's 2026-08-21
  // entry. A recipe with no steps yet has nothing to view, so it skips
  // straight to edit mode instead of showing an empty timeline that
  // needs an extra tap to do anything with.
  useEffect(() => {
    if (!recipe || initialized) return;
    const existing = recipe.instructions ?? [];
    const hasContent = existing.some((s) => s.text.trim().length > 0);
    if (existing.length > 1) {
      setFormatMode('steps');
      setStepItems(existing.map(stepFromRecipeStep));
      setBlockText(existing.map((s) => s.text).join('\n'));
    } else {
      setFormatMode('block');
      setBlockText(existing[0]?.text ?? '');
      setStepItems(existing.length === 1 ? [stepFromRecipeStep(existing[0])] : [emptyStepItem()]);
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

  // Parses a draft numeric field back to a number, or null if it's
  // empty/not a real number — a stray non-numeric paste silently drops
  // rather than blocking save, since these fields are optional anyway.
  const parseOptionalNumber = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  // The steps actually being displayed right now, regardless of which
  // format they were entered in — used both for the view-mode timeline
  // and to detect unsaved edits, so there's one source of truth for
  // "what would be saved if I hit Save right now." Key order matches
  // the DB's jsonb_build_object order (migration 0010) so isDirty's
  // JSON.stringify comparison against recipe.instructions is reliable.
  const currentInstructions: RecipeStep[] =
    formatMode === 'steps'
      ? stepItems
          .filter((s) => s.text.trim().length > 0)
          .map((s) => ({
            text: s.text.trim(),
            duration_minutes: parseOptionalNumber(s.durationMinutes),
            temperature_celsius: parseOptionalNumber(s.temperatureCelsius),
          }))
      : blockText.trim()
        ? [{ text: blockText.trim(), duration_minutes: null, temperature_celsius: null }]
        : [];
  const savedInstructions = recipe.instructions ?? [];
  const isDirty =
    screenMode === 'edit' && JSON.stringify(currentInstructions) !== JSON.stringify(savedInstructions);

  const switchFormat = (next: FormatMode) => {
    if (next === formatMode) return;
    if (next === 'block') {
      // Steps -> Block: join whatever's been typed so far into one
      // paragraph, one step per line. Duration/temperature don't carry
      // over — a free-text block has nowhere to hold them.
      setBlockText(stepItems.map((s) => s.text.trim()).filter(Boolean).join('\n'));
    } else {
      // Block -> Steps: split on line breaks, each non-empty line
      // becomes its own step row with a fresh stable id and no
      // duration/temperature yet.
      const split = blockText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      setStepItems(
        split.length > 0
          ? split.map((text) => ({ id: makeStepId(), text, durationMinutes: '', temperatureCelsius: '' }))
          : [emptyStepItem()]
      );
    }
    setFormatMode(next);
  };

  const updateStep = (stepId: string, value: string) => {
    setStepItems((prev) => prev.map((s) => (s.id === stepId ? { ...s, text: value } : s)));
  };

  const updateStepDuration = (stepId: string, value: string) => {
    setStepItems((prev) => prev.map((s) => (s.id === stepId ? { ...s, durationMinutes: value } : s)));
  };

  const updateStepTemperature = (stepId: string, value: string) => {
    setStepItems((prev) => prev.map((s) => (s.id === stepId ? { ...s, temperatureCelsius: value } : s)));
  };

  const removeStep = (stepId: string) => {
    setStepItems((prev) => (prev.length === 1 ? [emptyStepItem()] : prev.filter((s) => s.id !== stepId)));
  };

  const addStep = () => {
    setStepItems((prev) => [...prev, emptyStepItem()]);
  };

  // Moves the step at `fromIndex` by `shift` positions (can be more than
  // one — a fast drag across several rows resolves in a single move,
  // not a chain of adjacent swaps).
  const moveStep = (fromIndex: number, shift: number) => {
    setStepItems((prev) => {
      const toIndex = Math.min(Math.max(fromIndex + shift, 0), prev.length - 1);
      if (toIndex === fromIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
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
          <InstructionsTimeline steps={currentInstructions} accentColor={visual.color} colors={colors} />
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

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={!isReordering}
          >
            {formatMode === 'steps' ? (
              <>
                {stepItems.map((item, index) => (
                  <DraggableStepRow
                    key={item.id}
                    index={index}
                    total={stepItems.length}
                    text={item.text}
                    durationMinutes={item.durationMinutes}
                    temperatureCelsius={item.temperatureCelsius}
                    onChangeText={(v) => updateStep(item.id, v)}
                    onChangeDuration={(v) => updateStepDuration(item.id, v)}
                    onChangeTemperature={(v) => updateStepTemperature(item.id, v)}
                    onRemove={() => removeStep(item.id)}
                    onDragStart={() => setIsReordering(true)}
                    onDragEnd={(shift) => {
                      setIsReordering(false);
                      if (shift !== 0) moveStep(index, shift);
                    }}
                    colors={colors}
                    styles={styles}
                  />
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

/**
 * One draggable step row. Drag starts only from the handle icon
 * (activateAfterLongPress, same "hold to act" language as the recipe
 * ingredient list's hold-to-select removal) so it never competes with
 * the TextInput's own touch handling or the surrounding ScrollView's
 * normal scroll gesture.
 *
 * Simplified drag model: the row visually follows the finger while
 * held, but the actual list reorder is computed ONCE at release —
 * total drag distance divided by this row's own measured height,
 * rounded to a whole number of positions moved. This avoids the much
 * more failure-prone version (continuously re-deriving swap targets
 * mid-drag against every other row's live position) for a solo-dev app
 * where that complexity isn't worth the risk of a subtly-wrong gesture
 * bug that's hard to reproduce on-device.
 *
 * Duration/temperature are two small always-visible fields under the
 * main text input, rather than hidden behind a "+ add timer" toggle —
 * simpler to build and reason about first; worth revisiting for a
 * collapsed/on-demand version if it reads as too busy on-device.
 */
function DraggableStepRow({
  index,
  total,
  text,
  durationMinutes,
  temperatureCelsius,
  onChangeText,
  onChangeDuration,
  onChangeTemperature,
  onRemove,
  onDragStart,
  onDragEnd,
  colors,
  styles,
}: {
  index: number;
  total: number;
  text: string;
  durationMinutes: string;
  temperatureCelsius: string;
  onChangeText: (value: string) => void;
  onChangeDuration: (value: string) => void;
  onChangeTemperature: (value: string) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: (shift: number) => void;
  colors: Record<ColorToken, string>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const measuredHeight = useSharedValue(64);

  const pan = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart(() => {
      isDragging.value = true;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const rowHeight = measuredHeight.value || 64;
      const shift = Math.round(e.translationY / rowHeight);
      const clampedShift = Math.min(Math.max(shift, -index), total - 1 - index);
      translateY.value = withSpring(0);
      isDragging.value = false;
      runOnJS(onDragEnd)(clampedShift);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: isDragging.value ? 1.02 : 1 }],
    zIndex: isDragging.value ? 10 : 0,
    shadowOpacity: isDragging.value ? 0.15 : 0,
    elevation: isDragging.value ? 4 : 0,
  }));

  return (
    <Animated.View
      style={[styles.stepRow, animatedStyle]}
      onLayout={(e) => {
        measuredHeight.value = e.nativeEvent.layout.height;
      }}
    >
      <View style={styles.stepRowTop}>
        <GestureDetector gesture={pan}>
          <View style={styles.dragHandle} accessibilityLabel="Drag to reorder step">
            <Ionicons name="reorder-three-outline" size={20} color={colors.textSecondary} />
          </View>
        </GestureDetector>
        <Text style={styles.stepNumber}>{index + 1}.</Text>
        <TextInput
          style={styles.stepInput}
          value={text}
          onChangeText={onChangeText}
          placeholder={`e.g. ${index === 0 ? 'Preheat oven to 350\u00b0F' : 'Next step\u2026'}`}
          placeholderTextColor={colors.textSecondary}
          multiline
        />
        <Pressable onPress={onRemove} style={styles.removeStepButton} accessibilityLabel="Remove step">
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.metaInputRow}>
        <View style={styles.metaInputGroup}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <TextInput
            style={styles.metaInput}
            value={durationMinutes}
            onChangeText={onChangeDuration}
            placeholder="min"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.metaInputGroup}>
          <Ionicons name="thermometer-outline" size={14} color={colors.textSecondary} />
          <TextInput
            style={styles.metaInput}
            value={temperatureCelsius}
            onChangeText={onChangeTemperature}
            placeholder="\u00b0C"
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
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
    stepRow: {
      marginBottom: spacing.sm,
      backgroundColor: colors.background,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      borderRadius: radii.md,
    },
    stepRowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxs },
    dragHandle: { width: 28, height: 44, alignItems: 'center', justifyContent: 'center' },
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
    metaInputRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginLeft: 56,
      marginTop: spacing.xxs,
      marginBottom: spacing.xs,
    },
    metaInputGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      backgroundColor: colors.surface,
    },
    metaInput: {
      ...typography.bodySm,
      color: colors.textPrimary,
      width: 44,
      padding: 0,
    },
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
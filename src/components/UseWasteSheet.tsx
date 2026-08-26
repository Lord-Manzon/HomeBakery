import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { UsageSlider } from './UsageSlider';
import { USE_WASTE_REASONS, useWasteFormSchema, type UseWasteReason } from '../utils/validation/ingredientSchemas';
import { usePressScale } from '../hooks/usePressScale';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography, motionDuration, motionEasing } from '../theme';
import type { ColorToken } from '../theme/colors';

// Icon per reason, matching the original mockup — dropped when this
// component was first built, re-added 2026-08-16. Keyed against
// USE_WASTE_REASONS exactly so a typo here fails to compile rather than
// silently falling back.
const REASON_ICONS: Record<UseWasteReason, keyof typeof Ionicons.glyphMap> = {
  'Used in production': 'flame-outline',
  Wasted: 'trash-outline',
  Spoiled: 'warning-outline',
};

// Shared between the slider's internal snap-while-dragging behavior and
// the tappable quick-chip row below it — same four stops either way.
const QUICK_CHIP_POINTS = [25, 50, 75, 100] as const;

type UseWasteSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  currentStock: number;
  unit: string;
  onSubmit: (quantity: number, reason: UseWasteReason) => void;
  isSaving: boolean;
  errorMessage?: string | null;
};

/**
 * Per docs/UI_UX.md section E.4.4 — exactly three reasons, "Other" was
 * considered and dropped as too ambiguous to map to a movement type.
 * "Used in production" -> usage movement; "Wasted"/"Spoiled" -> waste
 * movement. That mapping happens in src/services/ingredients.ts, not
 * here — this component just collects quantity + reason.
 *
 * CHANGED 2026-08-16: added a live "new stock" preview that reads as an
 * inline error (danger color, no dash) once the entered quantity would
 * exceed current stock, and the Save button now visually disables
 * (border/opacity, not just non-interactive) instead of only being
 * inert — makes the invalid state visible before tapping, not just
 * after.
 *
 * UPDATED 2026-08-22: switched from the static `colors` import to
 * useThemeColors() + a per-render makeStyles(colors) (see RestockSheet.tsx,
 * IngredientFormSheet.tsx for the same pattern). Reason rows now use
 * usePressScale() for the same tactile feedback used elsewhere in the
 * Ingredients flow.
 *
 * UPDATED 2026-08-26: quantity entry is now primarily a slider
 * (UsageSlider) with a live "X kg used / Y% of current stock" readout
 * and quick chips (25/50/75/All) — "I used half of the thing" -> drag
 * to the middle. The original numeric field is kept underneath as a
 * secondary "or enter an exact amount" path. `quantity` stays the
 * single source of truth; the slider's percent is purely derived from
 * it, never stored separately, so the two controls can't disagree.
 */
export function UseWasteSheet({
  visible,
  onDismiss,
  currentStock,
  unit,
  onSubmit,
  isSaving,
  errorMessage,
}: UseWasteSheetProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<UseWasteReason | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const schema = useWasteFormSchema(currentStock);
    const parsed = schema.safeParse({ quantity, reason });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    onSubmit(parsed.data.quantity, parsed.data.reason);
  };

  const qtyNumber = Number(quantity) || 0;
  const exceedsStock = quantity !== '' && qtyNumber > currentStock;
  const isPositive = quantity !== '' && qtyNumber > 0;
  // Raw subtraction here would occasionally print results like
  // 3.3600000000000003 (classic floating-point artifact — same root
  // cause as 0.1 + 0.2 !== 0.3 in JS). Rounded to 2 decimals for
  // display/submission, matching the rounding already used when the
  // slider/quick-chips compute a quantity from a percent.
  const newStock = Math.max(0, Math.round((currentStock - qtyNumber) * 100) / 100);
  const canSave = isPositive && !exceedsStock && !!reason;
  // Shown as soon as the baker types a quantity over what's available —
  // not just after they press Save. Same wording useWasteFormSchema()
  // uses on submit, so the message is identical whether it appears
  // live or from the post-Save validation error.
  const liveStockError = exceedsStock
    ? `Not enough stock — you have ${currentStock} ${unit} left`
    : null;

  // Percent is DERIVED from `quantity`, not stored separately — quantity
  // stays the single source of truth (what actually gets submitted), so
  // the slider, quick chips, and manual field can never disagree. When
  // currentStock is 0 there's nothing to take a percentage of; the
  // slider/chips are disabled in that case (see below) rather than
  // dividing by zero.
  const sliderPercent = currentStock > 0 ? Math.max(0, Math.min(100, (qtyNumber / currentStock) * 100)) : 0;

  function handlePercentChange(pct: number) {
    if (currentStock <= 0) return;
    const amount = Math.round(((currentStock * pct) / 100) * 100) / 100;
    setQuantity(String(amount));
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>Use or waste stock</Text>
      <Text style={styles.subtitle}>
        You have {currentStock} {unit} available.
      </Text>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <View style={styles.sliderBlock}>
        <View style={styles.readoutWrap}>
          <View style={styles.readoutRow}>
            <Text style={styles.readoutAmount}>{qtyNumber}</Text>
            <Text style={styles.readoutUnit}>{unit} used</Text>
          </View>
          <Text style={styles.readoutPct}>{Math.round(sliderPercent)}% of current stock</Text>
        </View>

        <UsageSlider
          percent={sliderPercent}
          onChange={handlePercentChange}
          disabled={currentStock <= 0}
          accessibilityLabel={`Quantity used, in ${unit}`}
        />

        <View style={styles.chipsRow}>
          {QUICK_CHIP_POINTS.map((pct) => (
            <QuickChip
              key={pct}
              label={pct === 100 ? 'All' : `${pct}%`}
              isActive={Math.round(sliderPercent) === pct}
              disabled={currentStock <= 0}
              styles={styles}
              onPress={() => handlePercentChange(pct)}
            />
          ))}
        </View>
      </View>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or enter an exact amount</Text>
        <View style={styles.dividerLine} />
      </View>

      <FormField
        label={`Quantity (${unit})`}
        placeholder="0"
        keyboardType="decimal-pad"
        value={quantity}
        onChangeText={setQuantity}
        error={fieldErrors.quantity ?? liveStockError}
      />

      <Text style={styles.label}>Reason</Text>
      <View style={styles.reasonList}>
        {USE_WASTE_REASONS.map((r) => (
          <ReasonRow
            key={r}
            reason={r}
            isSelected={reason === r}
            styles={styles}
            colors={colors}
            onPress={() => setReason(r)}
          />
        ))}
      </View>
      {fieldErrors.reason ? <Text style={styles.fieldError}>{fieldErrors.reason}</Text> : null}

      {isPositive && (
        <Animated.View
          entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
          style={styles.summaryCard}
        >
          <Text style={styles.summaryLabel}>New stock</Text>
          <Text style={[styles.summaryValue, exceedsStock && { color: colors.danger }]}>
            {currentStock} − {qtyNumber} = {exceedsStock ? '—' : `${newStock} ${unit}`}
          </Text>
        </Animated.View>
      )}

      <PrimaryButton
        title="Save"
        onPress={handleSave}
        isLoading={isSaving}
        disabled={!canSave}
      />
    </BottomSheet>
  );
}

function QuickChip({
  label,
  isActive,
  disabled,
  styles,
  onPress,
}: {
  label: string;
  isActive: boolean;
  disabled: boolean;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const press = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive, disabled }}
      style={{ flex: 1 }}
    >
      <Animated.View style={[styles.chip, isActive && styles.chipActive, disabled && styles.chipDisabled, press.style]}>
        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function ReasonRow({
  reason,
  isSelected,
  styles,
  colors,
  onPress,
}: {
  reason: UseWasteReason;
  isSelected: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onPress: () => void;
}) {
  const press = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
    >
      <Animated.View
        style={[styles.reasonRow, isSelected && styles.reasonRowSelected, press.style]}
      >
        <Ionicons
          name={REASON_ICONS[reason]}
          size={16}
          color={isSelected ? colors.primary : colors.textSecondary}
          style={styles.reasonIcon}
        />
        <Text style={[styles.reasonText, isSelected && styles.reasonTextSelected]}>{reason}</Text>
      </Animated.View>
    </Pressable>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary },
    subtitle: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
    sliderBlock: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      marginBottom: spacing.md,
    },
    readoutWrap: { alignItems: 'center', marginBottom: spacing.xs },
    readoutRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xxs },
    // No named "metric" token exists yet for a big standalone number
    // like this (typography.ts's comment references section F's 22/600
    // "metric" style, but it was never added as an exported key) — sized
    // by hand here rather than inventing a new shared token for one use.
    readoutAmount: { fontSize: 28, lineHeight: 32, fontWeight: '700', color: colors.primary },
    readoutUnit: { ...typography.titleSm, color: colors.textSecondary },
    readoutPct: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    chipsRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
    chip: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xs + 2,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipDisabled: { opacity: 0.5 },
    chipText: { ...typography.bodySm, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: colors.textInverse },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
    dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    dividerText: { ...typography.caption, color: colors.textSecondary },
    reasonList: { marginBottom: spacing.md },
    reasonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      minHeight: 44,
    },
    reasonIcon: { marginRight: spacing.sm },
    reasonRowSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
    reasonText: { ...typography.body, color: colors.textPrimary },
    reasonTextSelected: { color: colors.primary, fontWeight: '600' },
    fieldError: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
    summaryCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    summaryLabel: { ...typography.caption, color: colors.textSecondary },
    summaryValue: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
  });
}
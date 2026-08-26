import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { StockGauge } from './StockGauge';
import { restockFormSchema, type RestockFormInput } from '../utils/validation/ingredientSchemas';
import { calculateRestockCostPerUnit } from '../services/ingredientLogic';
import { useBakerProfile } from '../hooks/useBakerProfile';
import { formatCurrency } from '../utils/currency';
import { usePressScale } from '../hooks/usePressScale';
import { useThemeColors } from '../theme/ThemeContext';
import {
  getStockGaugePercent,
  getStockGaugeStatus,
  getTopOffAmount,
  type GaugeSensitivity,
} from '../services/stockGauge';
import type { Ingredient } from '../types/ingredient';
import { radii, spacing, typography, motionDuration, motionEasing } from '../theme';
import type { ColorToken } from '../theme/colors';

type RestockSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  ingredient: Ingredient;
  onSubmit: (input: RestockFormInput) => void;
  isSaving: boolean;
  errorMessage?: string | null;
  /**
   * Most recent restock quantity_change for this ingredient, if any.
   * Deliberately a prop rather than a query inside this component — the
   * parent (ingredient detail screen) already loads full movement
   * history via useMovementHistory() to render Stock history, so this
   * reuses that already-fetched, already-cache-invalidated data instead
   * of firing a second network call for the same information. Still
   * "live" in the sense that it reflects the same TanStack Query cache
   * everything else on the screen does.
   */
  lastRestockQuantity?: number | null;
};

const CUSTOM_CHIP = 'custom' as const;
type ChipKey = 'lastTime' | 'topOff' | typeof CUSTOM_CHIP;

/**
 * UPDATED 2026-08-21: switched from the static `colors` import to
 * useThemeColors() + a per-render makeStyles(colors) (see IngredientFormSheet.tsx,
 * GaugeSensitivitySheet.tsx for the same pattern), and quick-add chips
 * now use usePressScale() for the same tactile feedback used elsewhere
 * in the Ingredients flow.
 */
export function RestockSheet({
  visible,
  onDismiss,
  ingredient,
  onSubmit,
  isSaving,
  errorMessage,
  lastRestockQuantity,
}: RestockSheetProps) {
  const { data: baker } = useBakerProfile();
  const sensitivity: GaugeSensitivity = baker?.gauge_sensitivity ?? 'balanced';
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [quantity, setQuantity] = useState('');
  const [totalCostPaid, setTotalCostPaid] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedChip, setSelectedChip] = useState<ChipKey>(CUSTOM_CHIP);

  const topOffAmount = getTopOffAmount(
    ingredient.current_stock,
    ingredient.low_stock_threshold,
    sensitivity
  );

  const handleSave = () => {
    const parsed = restockFormSchema.safeParse({
      quantity,
      totalCostPaid: totalCostPaid === '' ? null : totalCostPaid,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    onSubmit(parsed.data);
  };

  const applyChip = (chip: ChipKey, value: number | null) => {
    setSelectedChip(chip);
    if (value != null) {
      // Programmatic set — intentionally does NOT go through the
      // TextInput's onChangeText path that flips selectedChip to
      // 'custom', since tapping a preset is a distinct action from
      // typing.
      setQuantity(String(value));
    }
  };

  const handleQuantityChange = (text: string) => {
    setQuantity(text);
    setSelectedChip(CUSTOM_CHIP);
  };

  const addQty = Number(quantity) || 0;
  const newStock = ingredient.current_stock + addQty;
  const totalCostNumber = totalCostPaid === '' ? null : Number(totalCostPaid);
  const hasValidCost = totalCostNumber != null && !Number.isNaN(totalCostNumber);
  const newCostPerUnit = hasValidCost
    ? calculateRestockCostPerUnit(
        ingredient.current_stock,
        ingredient.cost_per_unit,
        addQty,
        totalCostNumber as number
      )
    : null;

  const previewPercent = getStockGaugePercent(
    newStock,
    ingredient.low_stock_threshold,
    sensitivity
  );
  const previewStatus = getStockGaugeStatus(newStock, ingredient.low_stock_threshold);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>Restock {ingredient.name}</Text>
      <Text style={styles.subtitle}>
        Currently {ingredient.current_stock} {ingredient.unit} at{' '}
        {formatCurrency(ingredient.cost_per_unit, baker?.currency)}/{ingredient.unit}
      </Text>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <Text style={styles.label}>Quantity to add ({ingredient.unit})</Text>
      <View style={styles.chipRow}>
        {lastRestockQuantity != null && lastRestockQuantity > 0 ? (
          <QuickAddChip
            label="Last time"
            sub={`${lastRestockQuantity} ${ingredient.unit}`}
            selected={selectedChip === 'lastTime'}
            styles={styles}
            onPress={() => applyChip('lastTime', lastRestockQuantity)}
          />
        ) : null}
        {topOffAmount != null && topOffAmount > 0 ? (
          <QuickAddChip
            label="Restock to Full"
            sub={`${topOffAmount} ${ingredient.unit}`}
            selected={selectedChip === 'topOff'}
            accent
            styles={styles}
            onPress={() => applyChip('topOff', topOffAmount)}
          />
        ) : null}
        <QuickAddChip
          label="Custom"
          sub="Type below"
          selected={selectedChip === CUSTOM_CHIP}
          styles={styles}
          onPress={() => applyChip(CUSTOM_CHIP, null)}
        />
      </View>
      <Text style={styles.chipHint}>Based on your last purchase and current alert level</Text>

      <TextInput
        value={quantity}
        onChangeText={handleQuantityChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.textSecondary}
        style={styles.quantityInput}
      />
      {fieldErrors.quantity ? <Text style={styles.fieldError}>{fieldErrors.quantity}</Text> : null}

      <FormField
        label="Total cost paid (optional)"
        placeholder="0.00"
        keyboardType="decimal-pad"
        value={totalCostPaid}
        onChangeText={setTotalCostPaid}
        error={fieldErrors.totalCostPaid}
      />
      <Text style={styles.hint}>
        Leave blank if you don't want to update the cost per {ingredient.unit} right now.
      </Text>

      {addQty > 0 && (
        <Animated.View
          entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
          style={styles.summaryCard}
        >
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>New stock</Text>
            <Text style={styles.summaryValue}>
              {ingredient.current_stock} + {addQty} = {newStock} {ingredient.unit}
            </Text>
          </View>
          {newCostPerUnit != null ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>New cost per unit</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                {formatCurrency(newCostPerUnit, baker?.currency)} (weighted avg)
              </Text>
            </View>
          ) : null}
          <View style={{ marginTop: spacing.xs }}>
            <StockGauge percent={previewPercent} status={previewStatus} />
            {previewPercent != null ? (
              <Text style={styles.gaugeCaption}>Gauge will read {previewPercent}% full</Text>
            ) : null}
          </View>
        </Animated.View>
      )}

      <PrimaryButton title="Save restock" onPress={handleSave} isLoading={isSaving} />
    </BottomSheet>
  );
}

function QuickAddChip({
  label,
  sub,
  selected,
  accent,
  styles,
  onPress,
}: {
  label: string;
  sub: string;
  selected: boolean;
  accent?: boolean;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const press = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          styles.chip,
          selected && styles.chipSelected,
          accent && !selected && styles.chipAccentUnselected,
          press.style,
        ]}
      >
        <Text style={styles.chipLabel}>{label}</Text>
        <Text style={styles.chipSub}>{sub}</Text>
      </Animated.View>
    </Pressable>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.xs },
    subtitle: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
    chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxs },
    chip: {
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xxs,
      minHeight: 44,
      justifyContent: 'center',
    },
    chipSelected: { borderWidth: 2, borderColor: colors.primary },
    chipAccentUnselected: { backgroundColor: colors.warningMuted },
    chipLabel: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    chipSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    chipHint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
    quantityInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      textAlign: 'center',
      ...typography.body,
      fontWeight: '600',
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    fieldError: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
    hint: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: -spacing.md,
      marginBottom: spacing.lg,
    },
    summaryCard: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: spacing.xs,
      marginBottom: spacing.xs,
    },
    summaryLabel: { ...typography.caption, color: colors.textSecondary },
    summaryValue: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    gaugeCaption: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  });
}
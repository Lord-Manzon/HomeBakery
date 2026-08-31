import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton } from './PrimaryButton';
import { StockGauge } from './StockGauge';
import { getStockGaugePercent, type GaugeSensitivity } from '../services/stockGauge';
import { usePressScale } from '../hooks/usePressScale';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

type GaugeSensitivitySheetProps = {
  visible: boolean;
  onDismiss: () => void;
  value: GaugeSensitivity;
  onSubmit: (value: GaugeSensitivity) => void;
  isSaving: boolean;
};

const OPTIONS: { key: GaugeSensitivity; label: string; description: string }[] = [
  {
    key: 'aggressive',
    label: 'Aggressive (×1)',
    description: 'Reads full right at your alert line — the earliest, most urgent warning.',
  },
  {
    key: 'tight',
    label: 'Tight (×2)',
    description: 'Bars read full sooner — less advance warning before low stock.',
  },
  {
    key: 'balanced',
    label: 'Balanced (×3)',
    description: 'Recommended — a fair runway between full and the alert line.',
  },
  {
    key: 'relaxed',
    label: 'Relaxed (×4)',
    description: 'More gradual decline visible, takes longer to look full after a restock.',
  },
];

// Fixed example used purely to illustrate the difference between presets —
// not a real ingredient.
// stock 5, threshold 6 -> aggressive 83%, tight 42%, balanced 28%,
// relaxed 21% — all four visibly different. The original 7/3 example
// saturated both aggressive (×1) and tight (×2) at 100%, which defeated
// the point of a side-by-side comparison once a 4th option existed.
const EXAMPLE_STOCK = 5;
const EXAMPLE_THRESHOLD = 6;

// UPDATED 2026-08-21: switched from the static `colors` import to
// useThemeColors() + a per-render makeStyles(colors) (see BottomSheet.tsx,
// FormField.tsx, IngredientFormSheet.tsx for the same pattern) so the
// sheet reacts to the baker's accent color / light-dark preference.
// Option cards now use usePressScale() for the same tactile press
// feedback used elsewhere in the Ingredients flow.
export function GaugeSensitivitySheet({
  visible,
  onDismiss,
  value,
  onSubmit,
  isSaving,
}: GaugeSensitivitySheetProps) {
  const [selected, setSelected] = useState<GaugeSensitivity>(value);
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>Stock gauge sensitivity</Text>
      <Text style={styles.subtitle}>
        Controls how full the stock bar reads relative to each ingredient's low-stock alert.
      </Text>

      {OPTIONS.map((opt) => {
        const isSelected = selected === opt.key;
        const percent = getStockGaugePercent(EXAMPLE_STOCK, EXAMPLE_THRESHOLD, opt.key);
        return (
          <SensitivityOption
            key={opt.key}
            label={opt.label}
            description={opt.description}
            percent={percent}
            isSelected={isSelected}
            styles={styles}
            onPress={() => setSelected(opt.key)}
          />
        );
      })}

      <PrimaryButton
        title="Save"
        onPress={() => onSubmit(selected)}
        isLoading={isSaving}
      />
    </BottomSheet>
  );
}

function SensitivityOption({
  label,
  description,
  percent,
  isSelected,
  styles,
  onPress,
}: {
  label: string;
  description: string;
  percent: number | null;
  isSelected: boolean;
  styles: ReturnType<typeof makeStyles>;
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
      <Animated.View style={[styles.option, isSelected && styles.optionSelected, press.style]}>
        <View style={styles.optionHeader}>
          <Text style={styles.optionLabel}>{label}</Text>
          <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
            {isSelected ? <View style={styles.radioInner} /> : null}
          </View>
        </View>
        <Text style={styles.optionDescription}>{description}</Text>
        <View style={styles.previewRow}>
          <View style={{ flex: 1 }}>
            <StockGauge percent={percent} status="ok" />
          </View>
          {/* Spells out both numbers (not just "Butter, 5kg stock") so
              it's clear this is illustrating a stock-vs-alert ratio, not
              describing a fixed real-world case — see EXAMPLE_STOCK /
              EXAMPLE_THRESHOLD above for why 5/6 was chosen. */}
          <Text style={styles.previewLabel}>
            Butter: {EXAMPLE_STOCK}kg / {EXAMPLE_THRESHOLD}kg alert
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.xs },
    subtitle: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    option: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    optionSelected: { borderWidth: 2, borderColor: colors.primary },
    optionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    optionLabel: { ...typography.titleSm, color: colors.textPrimary },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: radii.full,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterSelected: { borderColor: colors.primary },
    radioInner: {
      width: 9,
      height: 9,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
    },
    optionDescription: {
      ...typography.caption,
      color: colors.textSecondary,
      // Bumped from spacing.sm to spacing.md so the preview bar reads as
      // its own element rather than crowding the description text above
      // it — the bar carries real information (the actual gauge math),
      // it deserves more visual separation than a caption-to-caption gap.
      marginBottom: spacing.md,
    },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    previewLabel: { ...typography.caption, color: colors.textSecondary },
  });
}
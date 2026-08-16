import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton } from './PrimaryButton';
import { StockGauge } from './StockGauge';
import { getStockGaugePercent, type GaugeSensitivity } from '../services/stockGauge';
import { colors, radii, spacing, typography } from '../theme';

type GaugeSensitivitySheetProps = {
  visible: boolean;
  onDismiss: () => void;
  value: GaugeSensitivity;
  onSubmit: (value: GaugeSensitivity) => void;
  isSaving: boolean;
};

const OPTIONS: { key: GaugeSensitivity; label: string; description: string }[] = [
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
const EXAMPLE_STOCK = 7;
const EXAMPLE_THRESHOLD = 3;

export function GaugeSensitivitySheet({
  visible,
  onDismiss,
  value,
  onSubmit,
  isSaving,
}: GaugeSensitivitySheetProps) {
  const [selected, setSelected] = useState<GaugeSensitivity>(value);

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
          <Pressable
            key={opt.key}
            onPress={() => setSelected(opt.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            style={[styles.option, isSelected && styles.optionSelected]}
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionLabel}>{opt.label}</Text>
              <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                {isSelected ? <View style={styles.radioInner} /> : null}
              </View>
            </View>
            <Text style={styles.optionDescription}>{opt.description}</Text>
            <View style={styles.previewRow}>
              <View style={{ flex: 1 }}>
                <StockGauge percent={percent} status="ok" />
              </View>
              <Text style={styles.previewLabel}>Butter, 7kg stock</Text>
            </View>
          </Pressable>
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

const styles = StyleSheet.create({
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
    marginBottom: spacing.sm,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  previewLabel: { ...typography.caption, color: colors.textSecondary },
});

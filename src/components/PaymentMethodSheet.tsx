import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { PAYMENT_METHOD_OPTIONS } from '../utils/validation/orderSchemas';

type PaymentMethodSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  currentMethod: string | null;
  onSubmit: (method: string) => void;
  isSaving: boolean;
};

/**
 * Lets the baker correct an order's payment method after the fact --
 * reached by tapping the "Paid · Cash" badge on Order Detail, per
 * docs/DECISIONS.md's 2026-08-22 entry. The initial "Mark Paid" tap
 * itself never opens this -- it's a single immediate action that defaults
 * to Cash, precisely so this sheet is optional correction, not a
 * mandatory extra step on the common path.
 */
export function PaymentMethodSheet({
  visible,
  onDismiss,
  currentMethod,
  onSubmit,
  isSaving,
}: PaymentMethodSheetProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selected, setSelected] = useState(currentMethod ?? PAYMENT_METHOD_OPTIONS[0]);
  const [customValue, setCustomValue] = useState('');
  const isCustom = !PAYMENT_METHOD_OPTIONS.includes(selected as (typeof PAYMENT_METHOD_OPTIONS)[number]);

  useEffect(() => {
    if (!visible) return;
    const initial = currentMethod ?? PAYMENT_METHOD_OPTIONS[0];
    const initialIsKnown = PAYMENT_METHOD_OPTIONS.includes(
      initial as (typeof PAYMENT_METHOD_OPTIONS)[number]
    );
    setSelected(initialIsKnown ? initial : 'Other');
    setCustomValue(initialIsKnown ? '' : initial);
  }, [visible, currentMethod]);

  const handleSave = () => {
    const value = selected === 'Other' ? customValue.trim() : selected;
    if (!value) return;
    onSubmit(value);
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>Payment method</Text>
      <View style={styles.chipRow}>
        {[...PAYMENT_METHOD_OPTIONS, 'Other'].map((option) => (
          <Pressable
            key={option}
            onPress={() => setSelected(option)}
            style={[styles.chip, selected === option && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected === option && styles.chipTextSelected]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
      {selected === 'Other' ? (
        <FormField
          label="Payment method"
          placeholder="e.g. Venmo"
          value={customValue}
          onChangeText={setCustomValue}
        />
      ) : null}
      <PrimaryButton
        title={isSaving ? 'Saving…' : 'Save'}
        onPress={handleSave}
        isLoading={isSaving}
        disabled={selected === 'Other' && customValue.trim().length === 0}
      />
    </BottomSheet>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.lg },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { ...typography.bodySm, color: colors.textPrimary },
    chipTextSelected: { color: colors.textInverse },
  });
}

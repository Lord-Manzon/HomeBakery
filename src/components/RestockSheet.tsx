import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { restockFormSchema, type RestockFormInput } from '../utils/validation/ingredientSchemas';
import type { Ingredient } from '../types/ingredient';
import { colors, spacing, typography } from '../theme';

type RestockSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  ingredient: Ingredient;
  onSubmit: (input: RestockFormInput) => void;
  isSaving: boolean;
  errorMessage?: string | null;
};

/**
 * CHANGED 2026-08-15: was a full-screen route (per the original
 * docs/UI_UX.md section E.4.3 spec, matching the interaction-weight
 * table's "many fields → full screen" rule). Moved to a bottom sheet per
 * explicit direction during on-device testing — Restock only has 2
 * fields, closer to the "2-4 fields → sheet" bucket in practice than the
 * original call anticipated. docs/UI_UX.md and docs/DECISIONS.md need a
 * follow-up entry reflecting this reversal (see chat) — not done
 * automatically here since doc edits are handled separately.
 */
export function RestockSheet({
  visible,
  onDismiss,
  ingredient,
  onSubmit,
  isSaving,
  errorMessage,
}: RestockSheetProps) {
  const [quantity, setQuantity] = useState('');
  const [totalCostPaid, setTotalCostPaid] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>Restock {ingredient.name}</Text>
      <Text style={styles.subtitle}>
        Currently {ingredient.current_stock} {ingredient.unit} at{' '}
        {ingredient.cost_per_unit.toFixed(2)}/{ingredient.unit}
      </Text>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <FormField
        label={`Quantity to add (${ingredient.unit})`}
        placeholder="0"
        keyboardType="decimal-pad"
        value={quantity}
        onChangeText={setQuantity}
        error={fieldErrors.quantity}
      />

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

      <PrimaryButton title="Save restock" onPress={handleSave} isLoading={isSaving} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
});

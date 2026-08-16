import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { restockFormSchema, type RestockFormInput } from '../utils/validation/ingredientSchemas';
import { calculateRestockCostPerUnit } from '../services/ingredients';
import type { Ingredient } from '../types/ingredient';
import { colors, radii, spacing, typography } from '../theme';

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
 *
 * CHANGED 2026-08-16: added a live summary showing the new stock total
 * and, when a total cost is entered, the new weighted-average cost per
 * unit — using the same calculateRestockCostPerUnit() the actual save
 * calls, so the preview can never drift from what gets saved.
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

      {addQty > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>New stock</Text>
            <Text style={styles.summaryValue}>
              {ingredient.current_stock} + {addQty} = {newStock} {ingredient.unit}
            </Text>
          </View>
          {newCostPerUnit != null ? (
            <View style={[styles.summaryRow, styles.summaryRowLast]}>
              <Text style={styles.summaryLabel}>New cost per unit</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                {newCostPerUnit.toFixed(2)} (weighted avg)
              </Text>
            </View>
          ) : null}
        </View>
      )}

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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryRowLast: { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 },
  summaryLabel: { ...typography.caption, color: colors.textSecondary },
  summaryValue: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
});
